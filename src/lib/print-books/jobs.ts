import { v4 as uuidv4 } from 'uuid'
import { db } from '@/lib/db'
import type { ChildProfile, Story } from '@/types'
import { deriveBeatsFromStory } from '@/lib/print-books/beats'
import { generateCharacterBible } from '@/lib/print-books/characterBible'
import { composeHardcoverSpreads } from '@/lib/print-books/composer'
import {
  applySpreadIllustration,
  generateCoverIllustration,
  generateSpreadIllustration,
  isGeneratedIllustrationConfigured,
} from '@/lib/print-books/illustrations'
import { generateBookPdfs } from '@/lib/print-books/pdf'
import { LULU_SQUARE_HARDCOVER_SPEC, runLuluProofing } from '@/lib/print-books/proofing'
import { getBookProjectStageLabel } from '@/lib/print-books/status'
import type {
  BookArtMode,
  BookBuildJob,
  BookBuildJobStatus,
  BookBuildMode,
  BookProject,
  BookProjectStatus,
  CharacterBible,
} from '@/types/printBook'

export const BOOK_JOB_STALE_MS = 20_000

function getNowIso() {
  return new Date().toISOString()
}

function isTerminalJobStatus(status: BookBuildJobStatus) {
  return status === 'completed' || status === 'failed'
}

function getNextProofVersion(project: BookProject): number {
  return (project.assets.proofVersion ?? 0) + 1
}

function getProjectArtMode(input: {
  coverProvider?: 'openai' | 'placeholder'
  spreadProviders?: Array<'openai' | 'placeholder'>
  existingArtMode?: BookArtMode
}): BookArtMode {
  const providers = new Set<string>()
  if (input.coverProvider) providers.add(input.coverProvider)
  for (const provider of input.spreadProviders ?? []) providers.add(provider)
  if (providers.size === 0) return input.existingArtMode ?? 'placeholder'
  if (providers.size === 1) return providers.has('openai') ? 'generated' : 'placeholder'
  return 'mixed'
}

export function isBookBuildJobStale(job: BookBuildJob, now = Date.now()) {
  if (isTerminalJobStatus(job.status)) return false
  const updatedAt = Date.parse(job.updatedAt)
  if (Number.isNaN(updatedAt)) return true
  return now - updatedAt > BOOK_JOB_STALE_MS
}

function getQueuedStageLabel(mode: BookBuildMode, project: BookProject) {
  switch (mode) {
    case 'art':
      return `Queued to generate final art for ${project.spreads.length} spreads...`
    case 'exports':
      return 'Queued to refresh export files...'
    case 'finalize':
      return 'Queued to finalize the order package...'
    default:
      return getBookProjectStageLabel('queued')
  }
}

async function markJobProjectFailure(project: BookProject, jobId: string, errorCode: string, message: string) {
  await db.bookProjects.update(project.id, {
    status: 'failed',
    currentStageLabel: getBookProjectStageLabel('failed'),
    errorCode,
    errorMessage: message,
    assets: {
      ...project.assets,
      activeJobId: undefined,
      activeJobMode: undefined,
      activeJobStatus: undefined,
      activeJobUpdatedAt: undefined,
    },
  })

  await db.bookBuildJobs.update(jobId, {
    status: 'failed',
    errorMessage: message,
    completedAt: getNowIso(),
  })
}

async function loadBuildContext(project: BookProject) {
  const [story, profile, characters] = await Promise.all([
    db.stories.getById(project.sourceStoryId),
    db.profiles.getById(project.profileId),
    db.characters.getByProfileId(project.profileId),
  ])

  if (!story || story.userId !== project.userId) {
    throw new Error('Source story not found')
  }

  if (!profile || profile.userId !== project.userId) {
    throw new Error('Profile not found')
  }

  return {
    story,
    profile,
    characters: characters.filter((character) => character.userId === project.userId),
  }
}

async function regenerateProjectArt(input: {
  id: string
  project: BookProject
  story: Story
  profile: ChildProfile
  characterBible: CharacterBible
  buildMode: 'full' | 'art'
}) {
  const totalArtSteps = input.project.spreads.length
  const currentCursor = input.project.assets.artGenerationCursor ?? 0

  if (currentCursor >= totalArtSteps) {
    return db.bookProjects.update(input.id, {
      status: 'composing',
      currentStageLabel: getBookProjectStageLabel('composing'),
      beats: input.project.beats,
      characterBible: input.characterBible,
      completedSpreads: input.project.totalSpreads,
      totalSpreads: input.project.totalSpreads,
      assets: {
        ...input.project.assets,
        artGenerationCursor: undefined,
        artGenerationTotal: totalArtSteps,
        artMode: input.project.assets.artMode ?? 'placeholder',
        lastBuildMode: input.buildMode,
      },
    })
  }

  if (currentCursor === 0) {
    const cover = await generateCoverIllustration({
      project: input.project,
      story: input.story,
      profile: input.profile,
      characterBible: input.characterBible,
    })

    return db.bookProjects.update(input.id, {
      status: 'illustrating',
      currentStageLabel: `Generating final art 1 of ${totalArtSteps}...`,
      characterBible: input.characterBible,
      spreads: cover.spreads,
      completedSpreads: 1,
      totalSpreads: totalArtSteps,
      assets: {
        ...input.project.assets,
        coverImageUrl: cover.coverImageUrl,
        artMode: cover.provider === 'openai' ? 'generated' : 'placeholder',
        lastBuildMode: input.buildMode,
        artGenerationCursor: 1,
        artGenerationTotal: totalArtSteps,
      },
    })
  }

  const spread = input.project.spreads[currentCursor]
  if (!spread) {
    return db.bookProjects.update(input.id, {
      status: 'composing',
      currentStageLabel: getBookProjectStageLabel('composing'),
      beats: input.project.beats,
      characterBible: input.characterBible,
      completedSpreads: input.project.totalSpreads,
      totalSpreads: input.project.totalSpreads,
      assets: {
        ...input.project.assets,
        artGenerationCursor: undefined,
        artGenerationTotal: totalArtSteps,
        artMode: input.project.assets.artMode ?? 'placeholder',
        lastBuildMode: input.buildMode,
      },
    })
  }

  const illustrated = await generateSpreadIllustration({
    project: input.project,
    story: input.story,
    profile: input.profile,
    characterBible: input.characterBible,
    spread,
  })

  const illustratedSpreads = applySpreadIllustration(input.project.spreads, illustrated.spread)
  const nextCursor = currentCursor + 1
  const spreadProviders = illustratedSpreads
    .filter((currentSpread) => currentSpread.sequence > 1 && currentSpread.imageUrl)
    .map((currentSpread) => currentSpread.imageUrl?.includes('/spreads/') && currentSpread.imageUrl?.endsWith('.png') ? 'openai' : 'placeholder') as Array<'openai' | 'placeholder'>

  if (nextCursor >= totalArtSteps) {
    return db.bookProjects.update(input.id, {
      status: 'composing',
      currentStageLabel: getBookProjectStageLabel('composing'),
      beats: input.project.beats,
      characterBible: input.characterBible,
      spreads: illustratedSpreads,
      completedSpreads: totalArtSteps,
      totalSpreads: totalArtSteps,
      assets: {
        ...input.project.assets,
        artMode: getProjectArtMode({
          coverProvider: input.project.assets.coverImageUrl?.endsWith('.png') ? 'openai' : 'placeholder',
          spreadProviders,
          existingArtMode: input.project.assets.artMode,
        }),
        lastBuildMode: input.buildMode,
        artGenerationCursor: undefined,
        artGenerationTotal: totalArtSteps,
      },
    })
  }

  return db.bookProjects.update(input.id, {
    status: 'illustrating',
    currentStageLabel: `Generating final art ${nextCursor + 1} of ${totalArtSteps}...`,
    characterBible: input.characterBible,
    spreads: illustratedSpreads,
    completedSpreads: nextCursor,
    totalSpreads: totalArtSteps,
    assets: {
      ...input.project.assets,
      artMode: getProjectArtMode({
        coverProvider: input.project.assets.coverImageUrl?.endsWith('.png') ? 'openai' : 'placeholder',
        spreadProviders,
        existingArtMode: input.project.assets.artMode,
      }),
      lastBuildMode: input.buildMode,
      artGenerationCursor: nextCursor,
      artGenerationTotal: totalArtSteps,
    },
  })
}

async function finalizeProjectExports(input: {
  id: string
  project: BookProject
  story: Story
  profile: ChildProfile
  buildMode: BookBuildMode
}) {
  const nextProofVersion = getNextProofVersion(input.project)
  const pdfAssets = await generateBookPdfs({
    project: input.project,
    story: input.story,
    profile: input.profile,
  })

  const proofingAssets = {
    ...input.project.assets,
    coverImageUrl: input.project.assets.coverImageUrl,
    coverPdfUrl: pdfAssets.coverPdfUrl,
    coverPdfReadyForOrdering: pdfAssets.coverPdfReadyForOrdering,
    coverPdfSpineWidthIn: pdfAssets.coverPdfSpineWidthIn,
    coverPdfSpineSource: pdfAssets.coverPdfSpineSource,
    coverPdfPageWidthIn: pdfAssets.coverPdfPageWidthIn,
    coverPdfPageHeightIn: pdfAssets.coverPdfPageHeightIn,
    coverSpineTextIncluded: pdfAssets.coverSpineTextIncluded,
    previewPdfUrl: pdfAssets.previewPdfUrl,
    previewPdfPageWidthIn: pdfAssets.previewPdfPageWidthIn,
    previewPdfPageHeightIn: pdfAssets.previewPdfPageHeightIn,
    printPdfUrl: pdfAssets.printPdfUrl,
    printPdfPageWidthIn: pdfAssets.printPdfPageWidthIn,
    printPdfPageHeightIn: pdfAssets.printPdfPageHeightIn,
    interiorTextSafeMarginIn: pdfAssets.interiorTextSafeMarginIn,
    previewImages: pdfAssets.previewImages,
  }

  const proofingReport = runLuluProofing(
    {
      ...input.project,
      assets: proofingAssets,
    },
    { strictForOrdering: input.buildMode === 'finalize' },
  )

  const finalizedAt = input.buildMode === 'finalize' && proofingReport.orderabilityState === 'order_ready'
    ? getNowIso()
    : undefined

  const proofingProject = await db.bookProjects.update(input.id, {
    status: 'proofing',
    currentStageLabel: input.buildMode === 'finalize' ? 'Finalizing the order package...' : getBookProjectStageLabel('proofing'),
    assets: {
      ...proofingAssets,
      exportVersion: nextProofVersion,
      finalExportVersion: finalizedAt ? nextProofVersion : input.project.assets.finalExportVersion,
      lastBuildMode: input.buildMode,
      orderabilityState: proofingReport.orderabilityState,
      finalizedAt,
      exportProfile: LULU_SQUARE_HARDCOVER_SPEC.trimLabel,
      proofVersion: nextProofVersion,
      proofingPassed: proofingReport.passed,
      proofingChecks: proofingReport.checks,
      proofingWarnings: proofingReport.warnings,
      proofingErrors: proofingReport.errors,
    },
  })

  if (!proofingProject) return undefined

  const readyAt = getNowIso()
  return db.bookProjects.update(input.id, {
    status: 'ready',
    currentStageLabel: getBookProjectStageLabel('ready'),
    readyAt,
    assets: {
      ...proofingProject.assets,
    },
  })
}

async function advanceFullBuild(project: BookProject, context: Awaited<ReturnType<typeof loadBuildContext>>) {
  if (project.status === 'queued' || project.status === 'planning' || !project.beats.length) {
    const beats = deriveBeatsFromStory(context.story)
    return db.bookProjects.update(project.id, {
      status: 'bible',
      currentStageLabel: getBookProjectStageLabel('bible'),
      errorCode: undefined,
      errorMessage: undefined,
      beats,
      completedSpreads: 0,
      totalSpreads: project.spreadCount,
    })
  }

  if (project.status === 'bible' || !project.characterBible || !project.spreads.length) {
    const characterBible = await generateCharacterBible({
      profile: context.profile,
      story: context.story,
      characters: context.characters,
    })

    const spreads = composeHardcoverSpreads({
      bookProjectId: project.id,
      story: context.story,
      profile: context.profile,
      ageBand: project.ageBand,
      beats: project.beats,
      characterBible,
    })

    return db.bookProjects.update(project.id, {
      status: 'illustrating',
      currentStageLabel: getBookProjectStageLabel('illustrating'),
      characterBible,
      spreads,
      completedSpreads: 0,
      totalSpreads: spreads.length,
      assets: {
        ...project.assets,
        lastBuildMode: 'full',
        artGenerationCursor: 0,
        artGenerationTotal: spreads.length,
      },
    })
  }

  if (project.status === 'illustrating') {
    return regenerateProjectArt({
      id: project.id,
      project,
      story: context.story,
      profile: context.profile,
      characterBible: project.characterBible,
      buildMode: 'full',
    })
  }

  if (project.status === 'composing') {
    return finalizeProjectExports({
      id: project.id,
      project,
      story: context.story,
      profile: context.profile,
      buildMode: 'full',
    })
  }

  return project
}

async function advanceArtBuild(project: BookProject, context: Awaited<ReturnType<typeof loadBuildContext>>) {
  if (!project.characterBible || !project.spreads.length) {
    throw new Error('This book does not have a complete draft to illustrate yet.')
  }

  if (project.status === 'illustrating') {
    return regenerateProjectArt({
      id: project.id,
      project,
      story: context.story,
      profile: context.profile,
      characterBible: project.characterBible,
      buildMode: 'art',
    })
  }

  if (project.status === 'composing') {
    return finalizeProjectExports({
      id: project.id,
      project,
      story: context.story,
      profile: context.profile,
      buildMode: 'art',
    })
  }

  return project
}

async function advanceExportBuild(project: BookProject, context: Awaited<ReturnType<typeof loadBuildContext>>, mode: 'exports' | 'finalize') {
  if (!project.spreads.length || !project.assets.coverImageUrl) {
    throw new Error('This book does not have a complete draft to refresh yet.')
  }

  return finalizeProjectExports({
    id: project.id,
    project,
    story: context.story,
    profile: context.profile,
    buildMode: mode,
  })
}

export async function dispatchBookBuildJob(job: BookBuildJob) {
  const response = await fetch(`${job.baseUrl}/api/book-jobs/${job.id}/run`, {
    method: 'POST',
    headers: {
      'x-book-job-token': job.token,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Job dispatch failed with ${response.status}`)
  }
}

export async function enqueueBookBuildJob(input: {
  project: BookProject
  mode: BookBuildMode
  baseUrl: string
}) {
  const currentJob = await db.bookBuildJobs.getCurrentByProjectId(input.project.id)
  if (currentJob && !isTerminalJobStatus(currentJob.status)) {
    if (currentJob.mode !== input.mode) {
      throw new Error(`A ${currentJob.mode} build is already running for this book.`)
    }

    return {
      job: currentJob,
      project: input.project,
      alreadyQueued: true,
    }
  }

  if (input.mode === 'art' && !isGeneratedIllustrationConfigured()) {
    throw new Error('Final art generation needs OPENAI_API_KEY plus blob storage before it can run.')
  }

  if ((input.mode === 'exports' || input.mode === 'finalize') && (!input.project.spreads.length || !input.project.assets.coverImageUrl)) {
    throw new Error('This book does not have a complete draft to refresh yet.')
  }

  if (input.mode === 'art' && (!input.project.spreads.length || !input.project.characterBible)) {
    throw new Error('This book does not have a complete draft to illustrate yet.')
  }

  const createdAt = getNowIso()
  const job: BookBuildJob = {
    id: uuidv4(),
    projectId: input.project.id,
    userId: input.project.userId,
    mode: input.mode,
    status: 'queued',
    step: 0,
    totalSteps: input.mode === 'art' || input.mode === 'full' ? input.project.spreadCount : 1,
    token: uuidv4(),
    baseUrl: input.baseUrl,
    createdAt,
    updatedAt: createdAt,
  }

  await db.bookBuildJobs.create(job)

  const updatedProject = await db.bookProjects.update(input.project.id, {
    status:
      input.mode === 'full'
        ? 'queued'
        : input.mode === 'art'
          ? 'illustrating'
          : input.mode === 'finalize'
            ? 'proofing'
            : 'composing',
    currentStageLabel: getQueuedStageLabel(input.mode, input.project),
    errorCode: undefined,
    errorMessage: undefined,
    completedSpreads: input.mode === 'art' ? 0 : input.project.completedSpreads,
    totalSpreads: input.mode === 'art' ? input.project.spreads.length : input.project.totalSpreads,
    assets: {
      ...input.project.assets,
      activeJobId: job.id,
      activeJobMode: input.mode,
      activeJobStatus: 'queued',
      activeJobUpdatedAt: createdAt,
      lastBuildMode: input.mode,
      artGenerationCursor: input.mode === 'art' ? 0 : input.project.assets.artGenerationCursor,
      artGenerationTotal: input.mode === 'art' ? input.project.spreads.length : input.project.assets.artGenerationTotal,
    },
  })

  if (!updatedProject) {
    throw new Error('Book project not found')
  }

  return {
    job,
    project: updatedProject,
    alreadyQueued: false,
  }
}

export async function processBookBuildJob(jobId: string) {
  const job = await db.bookBuildJobs.getById(jobId)
  if (!job) {
    throw new Error('Job not found')
  }

  if (isTerminalJobStatus(job.status)) {
    return { job, shouldContinue: false }
  }

  const runningJob = await db.bookBuildJobs.update(job.id, {
    status: 'running',
    startedAt: job.startedAt ?? getNowIso(),
  })

  if (!runningJob) {
    throw new Error('Job not found')
  }

  const project = await db.bookProjects.getById(job.projectId)
  if (!project || project.userId !== job.userId) {
    await db.bookBuildJobs.update(job.id, {
      status: 'failed',
      errorMessage: 'Book project not found',
      completedAt: getNowIso(),
    })
    throw new Error('Book project not found')
  }

  try {
    const context = await loadBuildContext(project)
    let nextProject: BookProject | undefined

    switch (runningJob.mode) {
      case 'full':
        nextProject = await advanceFullBuild(project, context)
        break
      case 'art':
        nextProject = await advanceArtBuild(project, context)
        break
      case 'exports':
        nextProject = await advanceExportBuild(project, context, 'exports')
        break
      case 'finalize':
        nextProject = await advanceExportBuild(project, context, 'finalize')
        break
      default:
        nextProject = project
        break
    }

    if (!nextProject) {
      throw new Error('Book project not found')
    }

    const terminalProject = nextProject.status === 'ready' || nextProject.status === 'failed'
    const nextJobStatus: BookBuildJobStatus = terminalProject ? (nextProject.status === 'ready' ? 'completed' : 'failed') : 'running'
    const updatedJob = await db.bookBuildJobs.update(job.id, {
      status: nextJobStatus,
      step: runningJob.step + 1,
      currentStepLabel: nextProject.currentStageLabel,
      completedAt: terminalProject ? getNowIso() : undefined,
      errorMessage: nextProject.status === 'failed' ? nextProject.errorMessage : undefined,
    })

    if (!updatedJob) {
      throw new Error('Job not found')
    }

    const finalProject = await db.bookProjects.update(project.id, {
      assets: {
        ...nextProject.assets,
        activeJobId: terminalProject ? undefined : job.id,
        activeJobMode: terminalProject ? undefined : job.mode,
        activeJobStatus: terminalProject ? undefined : updatedJob.status,
        activeJobUpdatedAt: updatedJob.updatedAt,
      },
    })

    return {
      job: updatedJob,
      project: finalProject ?? nextProject,
      shouldContinue: !terminalProject,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown build error'
    const failureCode: `${BookProjectStatus}_failed` =
      runningJob.mode === 'finalize' || runningJob.mode === 'exports'
        ? 'proofing_failed'
        : runningJob.mode === 'art'
          ? 'illustrating_failed'
          : project.status === 'queued' || project.status === 'planning'
            ? 'planning_failed'
            : project.status === 'bible'
              ? 'bible_failed'
              : project.status === 'illustrating'
                ? 'illustrating_failed'
                : 'proofing_failed'

    await markJobProjectFailure(project, job.id, failureCode, message)
    throw error
  }
}
