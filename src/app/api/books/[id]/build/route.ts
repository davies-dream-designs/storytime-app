import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { deriveBeatsFromStory } from '@/lib/print-books/beats'
import { composeHardcoverSpreads } from '@/lib/print-books/composer'
import { getBookProjectStageLabel } from '@/lib/print-books/status'

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
    const spreads = composeHardcoverSpreads({
      bookProjectId: planningProject.id,
      story,
      profile,
      ageBand: planningProject.ageBand,
      beats,
    })

    const composingProject = await db.bookProjects.update(id, {
      status: 'composing',
      currentStageLabel: getBookProjectStageLabel('composing'),
      beats,
      spreads,
      completedSpreads: spreads.length,
      totalSpreads: spreads.length,
    })

    if (!composingProject) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const readyAt = new Date().toISOString()
    const readyProject = await db.bookProjects.update(id, {
      status: 'ready',
      currentStageLabel: getBookProjectStageLabel('ready'),
      readyAt,
    })

    return NextResponse.json(readyProject)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown build error'
    await db.bookProjects.update(id, {
      status: 'failed',
      currentStageLabel: getBookProjectStageLabel('failed'),
      errorCode: 'planning_failed',
      errorMessage: message,
    })

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
