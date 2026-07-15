import type { ChildProfile, Story } from '@/types'
import type { BookProject, BookSpread, CharacterBible } from '@/types/printBook'
import { buildIllustrationDirection } from '@/lib/print-books/characterBible'
import { isBookAssetStorageConfigured, storeBookAsset } from '@/lib/print-books/storage'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function getCoverSpread(spreads: BookSpread[]): BookSpread | undefined {
  return spreads.find((spread) => spread.sequence === 1 || spread.title === 'Cover')
}

export function buildCoverIllustrationPrompt(input: {
  project: BookProject
  story: Story
  profile: ChildProfile
  characterBible: CharacterBible
  coverSpread?: BookSpread
}): string {
  const { story, profile, characterBible, coverSpread } = input
  const sceneDirection = coverSpread?.illustrationPrompt ?? `Front cover for "${story.title}" starring ${profile.name}.`

  return [
    buildIllustrationDirection(characterBible),
    `Book title: ${story.title}.`,
    `Main child: ${profile.name}.`,
    `Age band: ${input.project.ageBand}.`,
    `Theme: ${story.theme || 'gentle bedtime adventure'}.`,
    `Cover scene: ${sceneDirection}`,
    'Create a portrait-oriented children’s hardcover front cover with space for title treatment and a warm bedtime-book feeling.',
    'Do not render any visible publisher logo or extra text into the art itself.',
  ].join(' ')
}

function createPlaceholderCoverSvg(input: {
  story: Story
  profile: ChildProfile
  characterBible: CharacterBible
}): string {
  const { story, profile, characterBible } = input
  const title = escapeXml(clampText(story.title, 56))
  const childName = escapeXml(profile.name)
  const palette = escapeXml(characterBible.palette)
  const childAppearance = escapeXml(clampText(characterBible.childAppearance, 140))
  const renderStyle = escapeXml(clampText(characterBible.renderStyle, 120))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e295f"/>
      <stop offset="55%" stop-color="#4c4f8f"/>
      <stop offset="100%" stop-color="#f1d6a6"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1536" fill="url(#sky)"/>
  <circle cx="810" cy="250" r="110" fill="#fff4c2" opacity="0.9"/>
  <path d="M0 1180 C180 1080 320 1110 470 1185 S830 1320 1024 1180 L1024 1536 L0 1536 Z" fill="#20315f"/>
  <path d="M0 1260 C170 1180 350 1210 520 1290 S870 1370 1024 1280 L1024 1536 L0 1536 Z" fill="#152245" opacity="0.85"/>
  <rect x="118" y="124" width="788" height="1288" rx="44" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="6"/>
  <text x="512" y="220" text-anchor="middle" fill="#fff9eb" font-size="34" font-family="Georgia, serif" letter-spacing="4">STORYCOT PRINT PREVIEW</text>
  <text x="512" y="430" text-anchor="middle" fill="#fffdf8" font-size="96" font-family="Georgia, serif" font-weight="700">${title}</text>
  <text x="512" y="520" text-anchor="middle" fill="#fef3cf" font-size="40" font-family="Georgia, serif">A bedtime story for ${childName}</text>
  <g transform="translate(275 735)">
    <circle cx="235" cy="10" r="26" fill="#ffebc6"/>
    <rect x="165" y="36" width="140" height="200" rx="50" fill="#f2ca57"/>
    <rect x="193" y="236" width="34" height="155" rx="17" fill="#94a7d6"/>
    <rect x="243" y="236" width="34" height="155" rx="17" fill="#94a7d6"/>
    <rect x="130" y="78" width="45" height="130" rx="20" fill="#ffebc6"/>
    <rect x="295" y="78" width="45" height="130" rx="20" fill="#ffebc6"/>
    <circle cx="130" cy="215" r="26" fill="#ffd36e" opacity="0.85"/>
    <path d="M98 430 C180 355 290 355 372 430" fill="none" stroke="#f7efe0" stroke-width="8" stroke-linecap="round"/>
  </g>
  <text x="512" y="1230" text-anchor="middle" fill="#fff7e8" font-size="36" font-family="Arial, sans-serif">Palette: ${palette}</text>
  <text x="512" y="1294" text-anchor="middle" fill="#fff7e8" font-size="28" font-family="Arial, sans-serif">${childAppearance}</text>
  <text x="512" y="1350" text-anchor="middle" fill="#fff7e8" font-size="24" font-family="Arial, sans-serif">${renderStyle}</text>
</svg>`
}

async function generateOpenAICoverPng(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      size: '1024x1536',
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI image generation failed: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string }>
  }

  const base64Image = payload.data?.[0]?.b64_json
  if (!base64Image) {
    throw new Error('OpenAI image generation returned no image data')
  }

  return Buffer.from(base64Image, 'base64')
}

async function generateOpenAIInteriorPng(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      size: '1536x1024',
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI image generation failed: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string }>
  }

  const base64Image = payload.data?.[0]?.b64_json
  if (!base64Image) {
    throw new Error('OpenAI image generation returned no image data')
  }

  return Buffer.from(base64Image, 'base64')
}

function replaceCoverSpreadImage(spreads: BookSpread[], coverImageUrl: string): BookSpread[] {
  return spreads.map((spread) =>
    spread.sequence === 1 || spread.title === 'Cover'
      ? {
          ...spread,
          imageUrl: coverImageUrl,
          thumbnailUrl: coverImageUrl,
        }
      : spread
  )
}

function replaceSpreadImage(spreads: BookSpread[], nextSpread: BookSpread): BookSpread[] {
  return spreads.map((spread) => (spread.id === nextSpread.id ? nextSpread : spread))
}

export function applySpreadIllustration(spreads: BookSpread[], nextSpread: BookSpread): BookSpread[] {
  return replaceSpreadImage(spreads, nextSpread)
}

function buildSpreadIllustrationPrompt(input: {
  project: BookProject
  story: Story
  profile: ChildProfile
  characterBible: CharacterBible
  spread: BookSpread
}): string {
  const { project, story, profile, characterBible, spread } = input

  return [
    buildIllustrationDirection(characterBible),
    `Book title: ${story.title}.`,
    `Main child: ${profile.name}.`,
    `Age band: ${project.ageBand}.`,
    `Spread sequence: ${spread.sequence}.`,
    `Pages: ${spread.pageStart}-${spread.pageEnd}.`,
    `Layout type: ${spread.layoutType}.`,
    `Scene brief: ${spread.sceneBrief}.`,
    `Illustration direction: ${spread.illustrationPrompt}.`,
    `Left page text: ${spread.leftPageText || 'None'}.`,
    `Right page text: ${spread.rightPageText || 'None'}.`,
    'Create a warm landscape children’s book spread illustration with no visible printed text or page numbers inside the art.',
  ].join(' ')
}

function createPlaceholderSpreadSvg(input: {
  story: Story
  profile: ChildProfile
  characterBible: CharacterBible
  spread: BookSpread
}): string {
  const { story, profile, characterBible, spread } = input
  const title = escapeXml(clampText(story.title, 48))
  const sceneBrief = escapeXml(clampText(spread.sceneBrief, 140))
  const illustrationPrompt = escapeXml(clampText(spread.illustrationPrompt, 180))
  const childName = escapeXml(profile.name)
  const palette = escapeXml(characterBible.palette)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1b2b5a"/>
      <stop offset="48%" stop-color="#5e5aa3"/>
      <stop offset="100%" stop-color="#f0d39d"/>
    </linearGradient>
  </defs>
  <rect width="1536" height="1024" fill="url(#sky)"/>
  <circle cx="1240" cy="180" r="86" fill="#fff1be" opacity="0.9"/>
  <path d="M0 780 C220 720 420 710 620 760 S1020 850 1230 800 S1430 760 1536 790 L1536 1024 L0 1024 Z" fill="#21345d"/>
  <path d="M0 845 C230 795 410 785 610 835 S1010 925 1210 880 S1420 835 1536 860 L1536 1024 L0 1024 Z" fill="#162546" opacity="0.85"/>
  <rect x="72" y="72" width="1392" height="880" rx="36" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="5"/>
  <text x="120" y="138" fill="#fff8ea" font-size="28" font-family="Arial, sans-serif">SPREAD ${spread.sequence} · PAGES ${spread.pageStart}-${spread.pageEnd}</text>
  <text x="120" y="214" fill="#fffef8" font-size="54" font-family="Georgia, serif" font-weight="700">${title}</text>
  <text x="120" y="278" fill="#fef0c9" font-size="30" font-family="Georgia, serif">${childName} · ${escapeXml(spread.layoutType)}</text>
  <g transform="translate(550 520)">
    <circle cx="220" cy="-80" r="24" fill="#ffebc6"/>
    <rect x="150" y="-54" width="140" height="180" rx="46" fill="#f2ca57"/>
    <rect x="178" y="126" width="34" height="135" rx="17" fill="#94a7d6"/>
    <rect x="228" y="126" width="34" height="135" rx="17" fill="#94a7d6"/>
    <rect x="116" y="-8" width="34" height="112" rx="16" fill="#ffebc6"/>
    <rect x="290" y="-8" width="34" height="112" rx="16" fill="#ffebc6"/>
    <circle cx="106" cy="144" r="24" fill="#ffd36e" opacity="0.88"/>
  </g>
  <text x="120" y="748" fill="#fff8ea" font-size="30" font-family="Arial, sans-serif">Palette: ${escapeXml(clampText(palette, 90))}</text>
  <text x="120" y="812" fill="#fff8ea" font-size="28" font-family="Arial, sans-serif">${sceneBrief}</text>
  <foreignObject x="120" y="850" width="1296" height="110">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#fff8ea;font-family:Arial,sans-serif;font-size:24px;line-height:1.4;">
      ${illustrationPrompt}
    </div>
  </foreignObject>
</svg>`
}

export async function generateCoverIllustration(input: {
  project: BookProject
  story: Story
  profile: ChildProfile
  characterBible: CharacterBible
}): Promise<{ coverImageUrl: string; spreads: BookSpread[]; provider: 'openai' | 'placeholder' }> {
  const coverSpread = getCoverSpread(input.project.spreads)
  const prompt = buildCoverIllustrationPrompt({ ...input, coverSpread })

  if (process.env.OPENAI_API_KEY && isBookAssetStorageConfigured()) {
    const png = await generateOpenAICoverPng(prompt)
    const coverImageUrl = await storeBookAsset({
      pathname: `books/${input.project.id}/cover.png`,
      body: png,
      contentType: 'image/png',
    })

    return {
      coverImageUrl,
      spreads: replaceCoverSpreadImage(input.project.spreads, coverImageUrl),
      provider: 'openai',
    }
  }

  const svg = createPlaceholderCoverSvg(input)
  const coverImageUrl = await storeBookAsset({
    pathname: `books/${input.project.id}/cover.svg`,
    body: svg,
    contentType: 'image/svg+xml',
  })

  return {
    coverImageUrl,
    spreads: replaceCoverSpreadImage(input.project.spreads, coverImageUrl),
    provider: 'placeholder',
  }
}

export async function generateSpreadIllustration(input: {
  project: BookProject
  story: Story
  profile: ChildProfile
  characterBible: CharacterBible
  spread: BookSpread
}): Promise<{ spread: BookSpread; provider: 'openai' | 'placeholder' }> {
  const prompt = buildSpreadIllustrationPrompt(input)

  if (process.env.OPENAI_API_KEY && isBookAssetStorageConfigured()) {
    const png = await generateOpenAIInteriorPng(prompt)
    const imageUrl = await storeBookAsset({
      pathname: `books/${input.project.id}/spreads/${input.spread.sequence}.png`,
      body: png,
      contentType: 'image/png',
    })

    return {
      spread: {
        ...input.spread,
        imageUrl,
        thumbnailUrl: imageUrl,
      },
      provider: 'openai',
    }
  }

  const svg = createPlaceholderSpreadSvg(input)
  const imageUrl = await storeBookAsset({
    pathname: `books/${input.project.id}/spreads/${input.spread.sequence}.svg`,
    body: svg,
    contentType: 'image/svg+xml',
  })

  return {
    spread: {
      ...input.spread,
      imageUrl,
      thumbnailUrl: imageUrl,
    },
    provider: 'placeholder',
  }
}
