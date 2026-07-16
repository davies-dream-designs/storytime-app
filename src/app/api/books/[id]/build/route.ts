import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { ChildProfile, Story } from '@/types'
import { deriveBeatsFromStory } from '@/lib/print-books/beats'
import { generateCharacterBible } from '@/lib/print-books/characterBible'
import { applySpreadIllustration, generateCoverIllustration, generateSpreadIllustration, isGeneratedIllustrationConfigured } from '@/lib/print-books/illustrations'
import { generateBookPdfs } from '@/lib/print-books/pdf'
import { LULU_SQUARE_HARDCOVER_SPEC, runLuluProofing } from '@/lib/print-books/proofing'
import { composeHardcoverSpreads } from '@/lib/print-books/composer'
import { getBookProjectStageLabel } from '@/lib/print-books/status'
import type { BookProject, BookBuildMode, BookProjectStatus, BookArtMode, CharacterBible } from '@/types/printBook'

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadProjectWithRetry(id: string, userId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const project = await db.bookProjects.getById(id)
    if (project && project.userId === userId) return project
    await sleep(150 * (attempt + 1))
  }

  return undefined
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

async function regenerateProjectArt(input: {
  id: string
  project: BookProject
  story: Story
  profile: ChildProfile
  characterBible: CharacterBible
  restart?: boolean
  chunked?: boolean
}) {
  if (!input.chunked) {
    const cover = await generateCoverIllustration({
      project: input.project,
      story: input.story,
      profile: input.profile,
      characterBible: input.characterBible,
    })

    let illustratedSpreads = cover.spreads
    const spreadProviders: Array<'openai' | 'placeholder'> = []
    let completedSpreads = illustratedSpreads.filter((spread) => Boolean(spread.imageUrl)).length

    const afterCoverProject = await db.bookProjects.update(input.id, {
      status: 'illustrating',
      currentStageLabel: getBookProjectStageLabel('illustrating'),
      characterBible: input.characterBible,
      spreads: illustratedSpreads,
      completedSpreads,
      totalSpreads: illustratedSpreads.length,
      assets: {
        ...input.project.assets,
        coverImageUrl: cover.coverImageUrl,
        artMode: getProjectArtMode({ coverProvider: cover.provider }),
        lastBuildMode: input.project.assets.lastBuildMode,
      },
    })

    if (!afterCoverProject) {
      return undefined
    }

    for (const spread of illustratedSpreads) {
      if (spread.sequence === 1) continue

      const illustrated = await generateSpreadIllustration({
        project: {
          ...afterCoverProject,
          spreads: illustratedSpreads,
          assets: {
            ...afterCoverProject.assets,
            coverImageUrl: cover.coverImageUrl,
          },
        },
        story: input.story,
        profile: input.profile,
        characterBible: input.characterBible,
        spread,
      })

      illustratedSpreads = applySpreadIllustration(illustratedSpreads, illustrated.spread)
      spreadProviders.push(illustrated.provider)
      completedSpreads = illustratedSpreads.filter((currentSpread) => Boolean(currentSpread.imageUrl)).length

      const progressProject = await db.bookProjects.update(input.id, {
        status: 'illustrating',
        currentStageLabel: getBookProjectStageLabel('illustrating'),
        characterBible: input.characterBible,
        spreads: illustratedSpreads,
        completedSpreads,
        totalSpreads: illustratedSpreads.length,
        assets: {
          ...afterCoverProject.assets,
          coverImageUrl: cover.coverImageUrl,
          artMode: getProjectArtMode({
            coverProvider: cover.provider,
            spreadProviders,
            existingArtMode: afterCoverProject.assets.artMode,
          }),
          lastBuildMode: input.project.assets.lastBuildMode,
        },
      })

      if (!progressProject) {
        return undefined
      }
    }

    return db.bookProjects.update(input.id, {
      status: 'composing',
      currentStageLabel: getBookProjectStageLabel('composing'),
      beats: input.project.beats,
      characterBible: input.characterBible,
      spreads: illustratedSpreads,
      completedSpreads,
      totalSpreads: illustratedSpreads.length,
      assets: {
        ...input.project.assets,
        coverImageUrl: cover.coverImageUrl,
        artMode: getProjectArtMode({
          coverProvider: cover.provider,
          spreadProviders,
          existingArtMode: input.project.assets.artMode,
        }),
        lastBuildMode: input.project.assets.lastBuildMode,
      },
    })
  }

  const totalArtSteps = input.project.spreads.length
  const currentCursor = input.restart ? 0 : (input.project.assets.artGenerationCursor ?? 0)

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
        artMode: 'generated',
        lastBuildMode: 'art',
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
        lastBuildMode: 'art',
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
        artMode: 'generated',
        lastBuildMode: 'art',
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
        artMode: illustrated.provider === 'openai' ? 'generated' : input.project.assets.artMode,
        lastBuildMode: 'art',
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
      artMode: illustrated.provider === 'openai' ? 'generated' : input.project.assets.artMode,
      lastBuildMode: 'art',
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
    ? new Date().toISOString()
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

  const readyAt = new Date().toISOString()
  return db.bookProjects.update(input.id, {
    status: 'ready',
    currentStageLabel: getBookProjectStageLabel('ready'),
    readyAt,
    assets: {
      ...proofingProject.assets,
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const project = await loadProjectWithRetry(id, userId)
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const story = await db.stories.getById(project.sourceStoryId)
  if (!story || story.userId !== userId) {
    return NextResponse.json({ error: 'Source story not found' }, { status: 404 })
  }

  const profile = await db.profiles.getById(project.profileId)
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const characters = (await db.characters.getByProfileId(profile.id)).filter((character) => character.userId === userId)
  const payload = (await req.json().catch(() => null)) as { mode?: BookBuildMode } | null
  const buildMode: BookBuildMode =
    payload?.mode === 'exports'
      ? 'exports'
      : payload?.mode === 'finalize'
        ? 'finalize'
        : payload?.mode === 'art'
          ? 'art'
          : 'full'
  let failureCode: `${BookProjectStatus}_failed` = 'planning_failed'

  try {
    if (buildMode === 'exports' || buildMode === 'finalize') {
      if (!project.spreads.length || !project.assets.coverImageUrl) {
        return NextResponse.json({ error: 'This book does not have a complete draft to refresh yet.' }, { status: 409 })
      }

      const exportProject = await db.bookProjects.update(id, {
        status: 'composing',
        currentStageLabel: buildMode === 'finalize' ? 'Finalizing the order package...' : 'Refreshing export files...',
        errorCode: undefined,
        errorMessage: undefined,
      })

      if (!exportProject) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      const readyProject = await finalizeProjectExports({
        id,
        project: exportProject,
        story,
        profile,
        buildMode,
      })

      if (!readyProject) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      return NextResponse.json(readyProject)
    }

    if (buildMode === 'art') {
      if (!project.spreads.length || !project.characterBible) {
        return NextResponse.json({ error: 'This book does not have a complete draft to illustrate yet.' }, { status: 409 })
      }

      if (!isGeneratedIllustrationConfigured()) {
        return NextResponse.json(
          { error: 'Final art generation needs OPENAI_API_KEY plus blob storage before it can run.' },
          { status: 409 },
        )
      }

      failureCode = 'illustrating_failed'
      const artProject = project.status === 'ready'
        ? await db.bookProjects.update(id, {
            status: 'illustrating',
            currentStageLabel: `Generating final art 1 of ${project.spreads.length}...`,
            errorCode: undefined,
            errorMessage: undefined,
            completedSpreads: 0,
            totalSpreads: project.spreads.length,
            assets: {
              ...project.assets,
              lastBuildMode: 'art',
              artGenerationCursor: 0,
              artGenerationTotal: project.spreads.length,
            },
          })
        : project

      if (!artProject) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      const nextProject = await regenerateProjectArt({
        id,
        project: artProject,
        story,
        profile,
        characterBible: project.characterBible,
        restart: project.status === 'ready',
        chunked: true,
      })

      if (!nextProject) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      if (nextProject.status !== 'composing') {
        return NextResponse.json(nextProject)
      }

      failureCode = 'proofing_failed'
      const readyProject = await finalizeProjectExports({
        id,
        project: nextProject,
        story,
        profile,
        buildMode,
      })

      if (!readyProject) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      return NextResponse.json(readyProject)
    }

    const planningProject = await db.bookProjects.update(id, {
      status: 'planning',
      currentStageLabel: getBookProjectStageLabel('planning'),
      errorCode: undefined,
      errorMessage: undefined,
    })

    if (!planningProject) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const beats = deriveBeatsFromStory(story)
    failureCode = 'bible_failed'

    const bibleProject = await db.bookProjects.update(id, {
      status: 'bible',
      currentStageLabel: getBookProjectStageLabel('bible'),
      beats,
    })

    if (!bibleProject) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const characterBible = await generateCharacterBible({
      profile,
      story,
      characters,
    })

    const spreads = composeHardcoverSpreads({
      bookProjectId: planningProject.id,
      story,
      profile,
      ageBand: planningProject.ageBand,
      beats,
      characterBible,
    })

    failureCode = 'illustrating_failed'
    const illustratingProject = await db.bookProjects.update(id, {
      status: 'illustrating',
      currentStageLabel: getBookProjectStageLabel('illustrating'),
      characterBible,
      spreads,
    })

    if (!illustratingProject) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const composingProject = await regenerateProjectArt({
      id,
      project: illustratingProject,
      story,
      profile,
      characterBible,
      chunked: false,
    })

    if (!composingProject) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    failureCode = 'proofing_failed'
    const readyProject = await finalizeProjectExports({
      id,
      project: composingProject,
      story,
      profile,
      buildMode,
    })

    if (!readyProject) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(readyProject)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown build error'
    await db.bookProjects.update(id, {
      status: 'failed',
      currentStageLabel: getBookProjectStageLabel('failed'),
      errorCode: failureCode,
      errorMessage: message,
    })

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
