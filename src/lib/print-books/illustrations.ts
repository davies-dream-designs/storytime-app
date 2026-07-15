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

function splitTitleLines(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['Untitled']

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }

    if (current) lines.push(current)
    current = word
  }

  if (current) lines.push(current)

  if (lines.length <= maxLines) return lines

  const capped = lines.slice(0, maxLines)
  capped[maxLines - 1] = clampText(capped[maxLines - 1] || '', maxChars)
  return capped
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
  const titleLines = splitTitleLines(story.title, 18, 3)
  const sceneHint = escapeXml(clampText(story.pages[0]?.illustrationPrompt || story.pages[0]?.text || story.theme || 'A gentle bedtime adventure.', 110))
  const palette = escapeXml(clampText(characterBible.palette, 80))
  const companion = escapeXml(clampText(characterBible.companionCharacters[0] || 'storybook friends', 32))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#20295d"/>
      <stop offset="58%" stop-color="#4a4d96"/>
      <stop offset="100%" stop-color="#f3d7a4"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff8dd" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#f7d86c" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1536" fill="url(#sky)"/>
  <circle cx="792" cy="238" r="118" fill="url(#glow)"/>
  <circle cx="792" cy="238" r="146" fill="#fff7dd" opacity="0.08"/>
  <path d="M0 1118 C124 1050 245 1026 392 1050 C534 1074 619 1136 750 1132 C875 1128 945 1088 1024 1048 L1024 1536 L0 1536 Z" fill="#223766"/>
  <path d="M0 1206 C136 1148 264 1136 394 1162 C531 1189 621 1265 768 1260 C882 1256 951 1216 1024 1178 L1024 1536 L0 1536 Z" fill="#17264a" opacity="0.92"/>
  <rect x="112" y="112" width="800" height="1312" rx="46" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="5"/>
  <g transform="translate(158 162)">
    <rect x="0" y="0" width="216" height="58" rx="29" fill="rgba(255,249,235,0.12)" stroke="rgba(255,249,235,0.22)" stroke-width="2"/>
    <circle cx="38" cy="29" r="14" fill="#f6cf65"/>
    <path d="M18 38 C30 28 44 28 58 38" fill="none" stroke="#fff8ea" stroke-width="4" stroke-linecap="round"/>
    <text x="76" y="38" fill="#fff8ea" font-size="24" font-family="Arial, sans-serif" font-weight="700">Storycot</text>
  </g>
  <text x="160" y="334" fill="#fff4d5" font-size="24" font-family="Arial, sans-serif" letter-spacing="4">PERSONALISED BEDTIME BOOK</text>
  <text x="160" y="436" fill="#fffdf8" font-size="84" font-family="Georgia, serif" font-weight="700">
    <tspan x="160" dy="0">${escapeXml(titleLines[0] || '')}</tspan>
    ${titleLines[1] ? `<tspan x="160" dy="92">${escapeXml(titleLines[1])}</tspan>` : ''}
    ${titleLines[2] ? `<tspan x="160" dy="92">${escapeXml(titleLines[2])}</tspan>` : ''}
  </text>
  <text x="160" y="690" fill="#fff0c8" font-size="34" font-family="Georgia, serif">A bedtime story for ${childName}</text>
  <text x="160" y="742" fill="#f7f0e1" font-size="22" font-family="Arial, sans-serif">${sceneHint}</text>
  <g transform="translate(0 34)">
    <path d="M226 1010 C336 902 470 840 610 840 C719 840 822 877 902 955" fill="none" stroke="#fff4d8" stroke-width="10" stroke-linecap="round"/>
    <circle cx="446" cy="896" r="28" fill="#ffd46c" opacity="0.92"/>
    <path d="M386 1002 C430 940 492 906 560 906 C634 906 706 944 756 1008" fill="none" stroke="#fff4d8" stroke-width="8" stroke-linecap="round"/>
    <circle cx="512" cy="942" r="18" fill="#fff0c9"/>
    <rect x="472" y="964" width="82" height="120" rx="36" fill="#f5cb5c"/>
    <rect x="444" y="990" width="28" height="90" rx="14" fill="#ffe8bf"/>
    <rect x="554" y="990" width="28" height="90" rx="14" fill="#ffe8bf"/>
    <rect x="490" y="1084" width="22" height="98" rx="11" fill="#97a9d9"/>
    <rect x="530" y="1084" width="22" height="98" rx="11" fill="#97a9d9"/>
  </g>
  <text x="160" y="1338" fill="#fff4d8" font-size="22" font-family="Arial, sans-serif">Palette inspiration: ${palette}</text>
  <text x="160" y="1378" fill="#f9f0de" font-size="20" font-family="Arial, sans-serif">Featuring ${companion}</text>
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
