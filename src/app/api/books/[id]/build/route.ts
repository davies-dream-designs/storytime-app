import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { deriveBeatsFromStory } from '@/lib/print-books/beats'
import { generateCharacterBible } from '@/lib/print-books/characterBible'
import { applySpreadIllustration, generateCoverIllustration, generateSpreadIllustration } from '@/lib/print-books/illustrations'
import { generateBookPdfs } from '@/lib/print-books/pdf'
import { LULU_SQUARE_HARDCOVER_SPEC, runLuluProofing } from '@/lib/print-books/proofing'
import { composeHardcoverSpreads } from '@/lib/print-books/composer'
import { getBookProjectStageLabel } from '@/lib/print-books/status'
import type { BookProjectStatus } from '@/types/printBook'

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

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  let failureCode: `${BookProjectStatus}_failed` = 'planning_failed'

  try {
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

    const cover = await generateCoverIllustration({
      project: illustratingProject,
      story,
      profile,
      characterBible,
    })

    let illustratedSpreads = cover.spreads
    let completedSpreads = illustratedSpreads.filter((spread) => Boolean(spread.imageUrl)).length

    const afterCoverProject = await db.bookProjects.update(id, {
      status: 'illustrating',
      currentStageLabel: getBookProjectStageLabel('illustrating'),
      characterBible,
      spreads: illustratedSpreads,
      completedSpreads,
      totalSpreads: illustratedSpreads.length,
      assets: {
        ...illustratingProject.assets,
        coverImageUrl: cover.coverImageUrl,
      },
    })

    if (!afterCoverProject) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    for (const spread of illustratedSpreads) {
      if (spread.sequence === 1 || spread.imageUrl) continue

      const illustrated = await generateSpreadIllustration({
        project: {
          ...afterCoverProject,
          spreads: illustratedSpreads,
          assets: {
            ...afterCoverProject.assets,
            coverImageUrl: cover.coverImageUrl,
          },
        },
        story,
        profile,
        characterBible,
        spread,
      })

      illustratedSpreads = applySpreadIllustration(illustratedSpreads, illustrated.spread)
      completedSpreads = illustratedSpreads.filter((currentSpread) => Boolean(currentSpread.imageUrl)).length

      const progressProject = await db.bookProjects.update(id, {
        status: 'illustrating',
        currentStageLabel: getBookProjectStageLabel('illustrating'),
        characterBible,
        spreads: illustratedSpreads,
        completedSpreads,
        totalSpreads: illustratedSpreads.length,
        assets: {
          ...afterCoverProject.assets,
          coverImageUrl: cover.coverImageUrl,
        },
      })

      if (!progressProject) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    }

    failureCode = 'composing_failed'
    const composingProject = await db.bookProjects.update(id, {
      status: 'composing',
      currentStageLabel: getBookProjectStageLabel('composing'),
      beats,
      characterBible,
      spreads: illustratedSpreads,
      completedSpreads,
      totalSpreads: illustratedSpreads.length,
      assets: {
        ...illustratingProject.assets,
        coverImageUrl: cover.coverImageUrl,
      },
    })

    if (!composingProject) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const pdfAssets = await generateBookPdfs({
      project: composingProject,
      story,
      profile,
    })

    const proofingReport = runLuluProofing({
      ...composingProject,
      assets: {
        ...composingProject.assets,
        coverImageUrl: composingProject.assets.coverImageUrl,
        previewPdfUrl: pdfAssets.previewPdfUrl,
        printPdfUrl: pdfAssets.printPdfUrl,
        previewImages: pdfAssets.previewImages,
      },
    })

    failureCode = 'proofing_failed'
    const proofingProject = await db.bookProjects.update(id, {
      status: 'proofing',
      currentStageLabel: getBookProjectStageLabel('proofing'),
      assets: {
        ...composingProject.assets,
        coverImageUrl: composingProject.assets.coverImageUrl,
        previewPdfUrl: pdfAssets.previewPdfUrl,
        printPdfUrl: pdfAssets.printPdfUrl,
        previewImages: pdfAssets.previewImages,
        exportProfile: LULU_SQUARE_HARDCOVER_SPEC.trimLabel,
        proofingPassed: proofingReport.passed,
        proofingWarnings: proofingReport.warnings,
        proofingErrors: proofingReport.errors,
      },
    })

    if (!proofingProject) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const readyAt = new Date().toISOString()
    const readyProject = await db.bookProjects.update(id, {
      status: 'ready',
      currentStageLabel: getBookProjectStageLabel('ready'),
      readyAt,
      assets: {
        ...proofingProject.assets,
      },
    })

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
