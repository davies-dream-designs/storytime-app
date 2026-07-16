export const SKIN_TONE_OPTIONS = [
  'very_fair',
  'fair',
  'light',
  'light_medium',
  'medium',
  'medium_deep',
  'deep',
  'very_deep',
] as const

export const UNDERTONE_OPTIONS = ['cool', 'neutral', 'warm', 'olive', 'not_sure'] as const

export const HAIR_COLOR_OPTIONS = [
  'black',
  'dark_brown',
  'medium_brown',
  'light_brown',
  'dark_blonde',
  'blonde',
  'auburn',
  'red',
  'grey',
  'other',
] as const

export const HAIR_TEXTURE_OPTIONS = ['straight', 'wavy', 'curly', 'coily', 'tightly_coiled'] as const
export const HAIR_LENGTH_OPTIONS = ['very_short', 'short', 'chin_length', 'shoulder_length', 'long'] as const
export const HAIR_STYLE_OPTIONS = [
  'loose',
  'bangs',
  'bob',
  'ponytail',
  'pigtails',
  'bun',
  'braids',
  'curls_out',
  'afro',
  'fade',
  'side_part',
  'locs',
  'twists',
  'other',
] as const

export const EYE_COLOR_OPTIONS = ['dark_brown', 'brown', 'hazel', 'green', 'blue', 'grey', 'mixed', 'other'] as const

export const FEATURE_EMPHASIS_OPTIONS = [
  'round_cheeks',
  'oval_face',
  'almond_eyes',
  'wide_eyes',
  'button_nose',
  'fuller_lips',
  'gap_toothed_smile',
  'dimpled_smile',
  'freckles',
  'soft_eyebrows',
  'long_lashes',
  'small_chin',
  'other',
] as const

export const DISTINGUISHING_FEATURE_OPTIONS = [
  'freckles',
  'glasses',
  'hearing_aid',
  'birthmark',
  'beauty_mark',
  'missing_tooth',
  'gap_teeth',
  'curly_fringe',
  'pierced_ears',
  'none',
  'other',
] as const

export const CLOTHING_VIBE_OPTIONS = [
  'pajamas',
  'cozy_knits',
  'bright_playful',
  'neutral_basics',
  'dresses',
  'overalls',
  'sporty',
  'formal',
  'mixed',
] as const

export const FAVORITE_CLOTHING_ITEM_OPTIONS = [
  'cardigan',
  'rain_boots',
  'sun_hat',
  'glasses',
  'hoodie',
  'backpack',
  'favorite_pajamas',
  'hair_bow',
  'other',
] as const

export const EXPRESSION_VIBE_OPTIONS = [
  'shy',
  'cheerful',
  'curious',
  'calm',
  'mischievous',
  'dreamy',
  'serious',
  'cuddly',
  'brave',
] as const

export const APPEARANCE_NOTE_MAX_LENGTH = 140
export const APPEARANCE_FEATURE_LIMIT = 3
export const APPEARANCE_EXPRESSION_LIMIT = 2
export const APPEARANCE_NOTE_EXAMPLES = [
  'Round cheeks, dark curly hair, red glasses, tiny gap in front teeth',
  'Usually wears a yellow cardigan and has a strawberry birthmark on left hand',
  'Very fluffy blond curls and always carries her bunny blanket',
] as const

export type SkinToneOption = (typeof SKIN_TONE_OPTIONS)[number]
export type UndertoneOption = (typeof UNDERTONE_OPTIONS)[number]
export type HairColorOption = (typeof HAIR_COLOR_OPTIONS)[number]
export type HairTextureOption = (typeof HAIR_TEXTURE_OPTIONS)[number]
export type HairLengthOption = (typeof HAIR_LENGTH_OPTIONS)[number]
export type HairStyleOption = (typeof HAIR_STYLE_OPTIONS)[number]
export type EyeColorOption = (typeof EYE_COLOR_OPTIONS)[number]
export type FeatureEmphasisOption = (typeof FEATURE_EMPHASIS_OPTIONS)[number]
export type DistinguishingFeatureOption = (typeof DISTINGUISHING_FEATURE_OPTIONS)[number]
export type ClothingVibeOption = (typeof CLOTHING_VIBE_OPTIONS)[number]
export type FavoriteClothingItemOption = (typeof FAVORITE_CLOTHING_ITEM_OPTIONS)[number]
export type ExpressionVibeOption = (typeof EXPRESSION_VIBE_OPTIONS)[number]

export interface ChildAppearance {
  skinTone?: SkinToneOption
  undertone?: UndertoneOption
  hairColor?: HairColorOption
  hairTexture?: HairTextureOption
  hairLength?: HairLengthOption
  hairStyles: HairStyleOption[]
  eyeColor?: EyeColorOption
  featureEmphasis: FeatureEmphasisOption[]
  distinguishingFeatures: DistinguishingFeatureOption[]
  clothingVibe?: ClothingVibeOption
  favoriteClothingItem?: FavoriteClothingItemOption
  expressionVibes: ExpressionVibeOption[]
  consistencyNote?: string
}

export function createEmptyChildAppearance(): ChildAppearance {
  return {
    hairStyles: [],
    featureEmphasis: [],
    distinguishingFeatures: [],
    expressionVibes: [],
  }
}

function normalizeValue<T extends readonly string[]>(value: unknown, options: T): T[number] | undefined {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined
}

function normalizeList<T extends readonly string[]>(value: unknown, options: T, max?: number): T[number][] {
  if (!Array.isArray(value)) return []
  const unique = Array.from(
    new Set(
      value.filter((item): item is T[number] => typeof item === 'string' && (options as readonly string[]).includes(item))
    )
  )
  return typeof max === 'number' ? unique.slice(0, max) : unique
}

export function sanitizeChildAppearance(input: unknown): ChildAppearance {
  const source = (input && typeof input === 'object' ? input : {}) as Partial<ChildAppearance>
  const note = typeof source.consistencyNote === 'string' ? source.consistencyNote.trim().slice(0, APPEARANCE_NOTE_MAX_LENGTH) : undefined

  return {
    skinTone: normalizeValue(source.skinTone, SKIN_TONE_OPTIONS),
    undertone: normalizeValue(source.undertone, UNDERTONE_OPTIONS),
    hairColor: normalizeValue(source.hairColor, HAIR_COLOR_OPTIONS),
    hairTexture: normalizeValue(source.hairTexture, HAIR_TEXTURE_OPTIONS),
    hairLength: normalizeValue(source.hairLength, HAIR_LENGTH_OPTIONS),
    hairStyles: normalizeList(source.hairStyles, HAIR_STYLE_OPTIONS),
    eyeColor: normalizeValue(source.eyeColor, EYE_COLOR_OPTIONS),
    featureEmphasis: normalizeList(source.featureEmphasis, FEATURE_EMPHASIS_OPTIONS, APPEARANCE_FEATURE_LIMIT),
    distinguishingFeatures: normalizeList(source.distinguishingFeatures, DISTINGUISHING_FEATURE_OPTIONS, APPEARANCE_FEATURE_LIMIT),
    clothingVibe: normalizeValue(source.clothingVibe, CLOTHING_VIBE_OPTIONS),
    favoriteClothingItem: normalizeValue(source.favoriteClothingItem, FAVORITE_CLOTHING_ITEM_OPTIONS),
    expressionVibes: normalizeList(source.expressionVibes, EXPRESSION_VIBE_OPTIONS, APPEARANCE_EXPRESSION_LIMIT),
    consistencyNote: note || undefined,
  }
}

const APPEARANCE_LABELS: Record<string, string> = {
  very_fair: 'very fair',
  fair: 'fair',
  light: 'light',
  light_medium: 'light-medium',
  medium: 'medium',
  medium_deep: 'medium-deep',
  deep: 'deep',
  very_deep: 'very deep',
  cool: 'cool',
  neutral: 'neutral',
  warm: 'warm',
  olive: 'olive',
  not_sure: 'not sure',
  black: 'black',
  dark_brown: 'dark brown',
  medium_brown: 'medium brown',
  light_brown: 'light brown',
  dark_blonde: 'dark blonde',
  blonde: 'blonde',
  auburn: 'auburn',
  red: 'red',
  grey: 'grey',
  other: 'other',
  straight: 'straight',
  wavy: 'wavy',
  curly: 'curly',
  coily: 'coily',
  tightly_coiled: 'tightly coiled',
  very_short: 'very short',
  short: 'short',
  chin_length: 'chin length',
  shoulder_length: 'shoulder length',
  long: 'long',
  loose: 'loose',
  bangs: 'bangs',
  bob: 'bob',
  ponytail: 'ponytail',
  pigtails: 'pigtails',
  bun: 'bun',
  braids: 'braids',
  curls_out: 'curls out',
  afro: 'afro',
  fade: 'fade',
  side_part: 'side part',
  locs: 'locs',
  twists: 'twists',
  dark_brown_eyes: 'dark brown',
  brown: 'brown',
  hazel: 'hazel',
  green: 'green',
  blue: 'blue',
  mixed: 'mixed',
  round_cheeks: 'round cheeks',
  oval_face: 'oval face',
  almond_eyes: 'almond eyes',
  wide_eyes: 'wide eyes',
  button_nose: 'button nose',
  fuller_lips: 'fuller lips',
  gap_toothed_smile: 'gap-toothed smile',
  dimpled_smile: 'dimpled smile',
  freckles: 'freckles',
  soft_eyebrows: 'soft eyebrows',
  long_lashes: 'long lashes',
  small_chin: 'small chin',
  glasses: 'glasses',
  hearing_aid: 'hearing aid',
  birthmark: 'birthmark',
  beauty_mark: 'beauty mark',
  missing_tooth: 'missing tooth',
  gap_teeth: 'gap teeth',
  curly_fringe: 'curly fringe',
  pierced_ears: 'pierced ears',
  none: 'none',
  pajamas: 'pajamas',
  cozy_knits: 'cozy knits',
  bright_playful: 'bright playful',
  neutral_basics: 'neutral basics',
  dresses: 'dresses',
  overalls: 'overalls',
  sporty: 'sporty',
  formal: 'formal',
  cardigan: 'cardigan',
  rain_boots: 'rain boots',
  sun_hat: 'sun hat',
  hoodie: 'hoodie',
  backpack: 'backpack',
  favorite_pajamas: 'favorite pajamas',
  hair_bow: 'hair bow',
  shy: 'shy',
  cheerful: 'cheerful',
  curious: 'curious',
  calm: 'calm',
  mischievous: 'mischievous',
  dreamy: 'dreamy',
  serious: 'serious',
  cuddly: 'cuddly',
  brave: 'brave',
}

export function getAppearanceOptionLabel(value?: string) {
  if (!value) return ''
  return APPEARANCE_LABELS[value] ?? value.replaceAll('_', ' ')
}

function joinLabeled(values: string[]) {
  return values.map((value) => getAppearanceOptionLabel(value)).join(', ')
}

export function buildChildAppearanceSummary(appearance?: ChildAppearance) {
  if (!appearance) return ''

  const parts: string[] = []
  if (appearance.skinTone) {
    const undertone = appearance.undertone && appearance.undertone !== 'not_sure' ? ` ${getAppearanceOptionLabel(appearance.undertone)}` : ''
    parts.push(`${getAppearanceOptionLabel(appearance.skinTone)}${undertone} skin`)
  }
  if (appearance.hairColor || appearance.hairTexture || appearance.hairLength) {
    parts.push(
      [appearance.hairColor, appearance.hairTexture, appearance.hairLength]
        .filter(Boolean)
        .map((value) => getAppearanceOptionLabel(value))
        .join(' ')
        .trim() + ' hair'
    )
  }
  if (appearance.hairStyles.length > 0) parts.push(`usually styled in ${joinLabeled(appearance.hairStyles)}`)
  if (appearance.eyeColor) parts.push(`${getAppearanceOptionLabel(appearance.eyeColor)} eyes`)
  if (appearance.featureEmphasis.length > 0) parts.push(`features include ${joinLabeled(appearance.featureEmphasis)}`)
  if (appearance.distinguishingFeatures.length > 0) parts.push(`distinguishing details: ${joinLabeled(appearance.distinguishingFeatures)}`)
  if (appearance.clothingVibe) parts.push(`usually dressed in a ${getAppearanceOptionLabel(appearance.clothingVibe)} style`)
  if (appearance.favoriteClothingItem) parts.push(`often shown with ${getAppearanceOptionLabel(appearance.favoriteClothingItem)}`)
  if (appearance.expressionVibes.length > 0) parts.push(`expression tends to feel ${joinLabeled(appearance.expressionVibes)}`)
  if (appearance.consistencyNote) parts.push(appearance.consistencyNote)
  return parts.join('; ')
}

export function buildChildAppearanceDoNotChange(appearance?: ChildAppearance) {
  if (!appearance) return []

  const traits = [
    appearance.skinTone ? `${getAppearanceOptionLabel(appearance.skinTone)} skin tone` : '',
    appearance.hairColor || appearance.hairTexture
      ? `${[appearance.hairColor, appearance.hairTexture].filter(Boolean).map((value) => getAppearanceOptionLabel(value)).join(' ')} hair`
      : '',
    appearance.eyeColor ? `${getAppearanceOptionLabel(appearance.eyeColor)} eyes` : '',
    ...appearance.distinguishingFeatures.map((value) => getAppearanceOptionLabel(value)),
    ...appearance.featureEmphasis.slice(0, 2).map((value) => getAppearanceOptionLabel(value)),
  ].filter(Boolean)

  return Array.from(new Set(traits)).slice(0, 6)
}
