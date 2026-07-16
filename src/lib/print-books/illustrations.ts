import type { ChildProfile, Story } from '@/types'
import type { BookProject, BookSpread, CharacterBible } from '@/types/printBook'
import { buildIllustrationDirection } from '@/lib/print-books/characterBible'
import { isBookAssetStorageConfigured, storeBookAsset } from '@/lib/print-books/storage'

export function isGeneratedIllustrationConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && isBookAssetStorageConfigured()
}

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

type PlaceholderCoverTheme = {
  skyTop: string
  skyMid: string
  skyBottom: string
  moon: string
  hillFront: string
  hillBack: string
  accent: string
  accentSoft: string
  motif: 'ocean' | 'garden' | 'night' | 'adventure'
}

function pickPlaceholderCoverTheme(story: Story): PlaceholderCoverTheme {
  const source = `${story.title} ${story.theme || ''} ${story.pages[0]?.text || ''} ${story.pages[0]?.illustrationPrompt || ''}`.toLowerCase()

  if (/(wave|ocean|sea|beach|shore|sand|pebble|shell|tide)/.test(source)) {
    return {
      skyTop: '#1f2f63',
      skyMid: '#5860a9',
      skyBottom: '#f0d6aa',
      moon: '#fff1bc',
      hillFront: '#1d3764',
      hillBack: '#27477c',
      accent: '#f6ce69',
      accentSoft: '#ffe7ba',
      motif: 'ocean',
    }
  }

  if (/(garden|flower|forest|tree|leaf|meadow|field|fox|rabbit|bunny)/.test(source)) {
    return {
      skyTop: '#21414d',
      skyMid: '#5d7d68',
      skyBottom: '#f3ddb4',
      moon: '#fdf0be',
      hillFront: '#274837',
      hillBack: '#3f674d',
      accent: '#f4c867',
      accentSoft: '#f9ebc9',
      motif: 'garden',
    }
  }

  if (/(moon|star|night|sleep|dream|sky|cloud)/.test(source)) {
    return {
      skyTop: '#1d2552',
      skyMid: '#4d5198',
      skyBottom: '#e8cfa5',
      moon: '#fff2c8',
      hillFront: '#1c2f5d',
      hillBack: '#31457f',
      accent: '#f6cd68',
      accentSoft: '#fff1c8',
      motif: 'night',
    }
  }

  return {
    skyTop: '#29356b',
    skyMid: '#645ca8',
    skyBottom: '#efd8b0',
    moon: '#fff1c4',
    hillFront: '#223463',
    hillBack: '#31467d',
    accent: '#f7cf68',
    accentSoft: '#ffebc2',
    motif: 'adventure',
  }
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
  const titleLines = splitTitleLines(story.title, 17, 3)
  const titleSize = titleLines.length === 1 ? 88 : titleLines.length === 2 ? 76 : 68
  const titleLineStep = titleSize + 12
  const titleBlockHeight = titleLineStep * titleLines.length
  const subtitleY = 434 + titleBlockHeight
  const theme = pickPlaceholderCoverTheme(story)
  const companion = escapeXml(clampText(characterBible.companionCharacters[0] || 'a storybook friend', 28))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${theme.skyTop}"/>
      <stop offset="58%" stop-color="${theme.skyMid}"/>
      <stop offset="100%" stop-color="${theme.skyBottom}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1536" fill="url(#sky)"/>
  <circle cx="796" cy="224" r="112" fill="${theme.moon}" opacity="0.95"/>
  <circle cx="796" cy="224" r="144" fill="${theme.moon}" opacity="0.08"/>
  <circle cx="182" cy="214" r="4" fill="#fff6de" opacity="0.75"/>
  <circle cx="228" cy="254" r="3" fill="#fff6de" opacity="0.55"/>
  <circle cx="884" cy="380" r="4" fill="#fff6de" opacity="0.7"/>
  <circle cx="832" cy="420" r="3" fill="#fff6de" opacity="0.6"/>
  <path d="M0 1088 C136 1028 282 1000 412 1026 C562 1056 650 1118 794 1110 C882 1104 955 1074 1024 1038 L1024 1536 L0 1536 Z" fill="${theme.hillBack}"/>
  <path d="M0 1188 C142 1138 286 1124 420 1148 C578 1177 681 1248 832 1236 C906 1230 972 1204 1024 1178 L1024 1536 L0 1536 Z" fill="${theme.hillFront}"/>
  <rect x="112" y="112" width="800" height="1312" rx="46" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="5"/>
  <g transform="translate(158 162)">
    <rect x="0" y="0" width="216" height="58" rx="29" fill="rgba(255,249,235,0.12)" stroke="rgba(255,249,235,0.22)" stroke-width="2"/>
    <circle cx="38" cy="29" r="14" fill="${theme.accent}"/>
    <path d="M18 38 C30 28 44 28 58 38" fill="none" stroke="#fff8ea" stroke-width="4" stroke-linecap="round"/>
    <text x="76" y="38" fill="#fff8ea" font-size="24" font-family="Arial, sans-serif" font-weight="700">Storycot</text>
  </g>
  <text x="160" y="326" fill="#fff4d5" font-size="22" font-family="Arial, sans-serif" letter-spacing="3">PERSONALISED BEDTIME STORY</text>
  <text x="160" y="434" fill="#fffdf8" font-size="${titleSize}" font-family="Georgia, serif" font-weight="700">
    <tspan x="160" dy="0">${escapeXml(titleLines[0] || '')}</tspan>
    ${titleLines[1] ? `<tspan x="160" dy="${titleLineStep}">${escapeXml(titleLines[1])}</tspan>` : ''}
    ${titleLines[2] ? `<tspan x="160" dy="${titleLineStep}">${escapeXml(titleLines[2])}</tspan>` : ''}
  </text>
  <text x="160" y="${subtitleY}" fill="#fff0c8" font-size="34" font-family="Georgia, serif">A story for ${childName}</text>
  <g transform="translate(0 24)">
    <path d="M180 1028 C300 948 432 906 588 906 C724 906 846 942 932 1008" fill="none" stroke="${theme.accentSoft}" stroke-width="10" stroke-linecap="round" opacity="0.95"/>
    ${
      theme.motif === 'ocean'
        ? `<path d="M196 1062 C312 1036 400 1024 500 1042 C582 1056 652 1086 736 1082 C824 1078 892 1038 966 1012" fill="none" stroke="${theme.accentSoft}" stroke-width="8" stroke-linecap="round" opacity="0.82"/>
           <circle cx="468" cy="1012" r="16" fill="${theme.accent}" opacity="0.96"/>
           <circle cx="512" cy="994" r="12" fill="${theme.accentSoft}" opacity="0.88"/>
           <circle cx="552" cy="1018" r="18" fill="${theme.accent}" opacity="0.8"/>`
        : theme.motif === 'garden'
          ? `<path d="M462 968 C450 938 458 900 486 872" fill="none" stroke="${theme.accentSoft}" stroke-width="8" stroke-linecap="round"/>
             <path d="M540 974 C552 938 548 902 520 872" fill="none" stroke="${theme.accentSoft}" stroke-width="8" stroke-linecap="round"/>
             <circle cx="486" cy="862" r="24" fill="${theme.accent}" opacity="0.96"/>
             <circle cx="520" cy="862" r="24" fill="${theme.accent}" opacity="0.9"/>
             <circle cx="502" cy="832" r="20" fill="${theme.accentSoft}" opacity="0.92"/>`
          : theme.motif === 'night'
            ? `<circle cx="480" cy="982" r="20" fill="${theme.accent}" opacity="0.92"/>
               <circle cx="524" cy="958" r="14" fill="${theme.accentSoft}" opacity="0.9"/>
               <circle cx="560" cy="990" r="10" fill="${theme.accent}" opacity="0.82"/>
               <path d="M486 1086 L504 1046 L522 1086" fill="none" stroke="${theme.accentSoft}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
            : `<path d="M456 1022 C486 978 526 944 584 922" fill="none" stroke="${theme.accentSoft}" stroke-width="8" stroke-linecap="round"/>
               <circle cx="446" cy="1036" r="18" fill="${theme.accent}" opacity="0.92"/>
               <circle cx="586" cy="916" r="14" fill="${theme.accentSoft}" opacity="0.9"/>
               <circle cx="640" cy="890" r="10" fill="${theme.accent}" opacity="0.82"/>`
    }
  </g>
  <rect x="160" y="1296" width="308" height="56" rx="28" fill="rgba(255,248,230,0.12)" stroke="rgba(255,248,230,0.2)" stroke-width="2"/>
  <text x="194" y="1332" fill="#fff4d8" font-size="22" font-family="Arial, sans-serif">Featuring ${companion}</text>
</svg>`
}

async function generateOpenAICoverPng(prompt: string): Promise<Buffer> {
  return generateOpenAIImage({
    prompt,
    size: '1024x1536',
  })
}

async function generateOpenAIInteriorPng(prompt: string): Promise<Buffer> {
  return generateOpenAIImage({
    prompt,
    size: '1536x1024',
  })
}

function getPreferredOpenAIImageModels(): string[] {
  const configured = process.env.OPENAI_IMAGE_MODEL?.trim()
  if (configured) return [configured]

  return ['gpt-image-2', 'gpt-image-1']
}

function shouldTryNextImageModel(status: number, bodyText: string): boolean {
  if (!(status === 400 || status === 404)) return false
  const normalized = bodyText.toLowerCase()
  return (
    normalized.includes('model') ||
    normalized.includes('not found') ||
    normalized.includes('unsupported') ||
    normalized.includes('not available') ||
    normalized.includes('does not exist')
  )
}

async function generateOpenAIImage(input: {
  prompt: string
  size: '1024x1536' | '1536x1024'
}): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const models = getPreferredOpenAIImageModels()
  let lastErrorMessage = 'Unknown OpenAI image generation error'

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]!
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        size: input.size,
        output_format: 'png',
        quality: 'medium',
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      lastErrorMessage = `OpenAI image generation failed for ${model}: ${response.status} ${errorBody}`
      const canFallback = index < models.length - 1 && shouldTryNextImageModel(response.status, errorBody)
      if (canFallback) continue
      throw new Error(lastErrorMessage)
    }

    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string }>
    }

    const base64Image = payload.data?.[0]?.b64_json
    if (!base64Image) {
      throw new Error(`OpenAI image generation returned no image data for ${model}`)
    }

    return Buffer.from(base64Image, 'base64')
  }

  throw new Error(lastErrorMessage)
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

  if (isGeneratedIllustrationConfigured()) {
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

  if (isGeneratedIllustrationConfigured()) {
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
