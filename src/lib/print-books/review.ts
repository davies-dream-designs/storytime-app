import type {
  BookProject,
  BookSpread,
  IllustrationGenerationMetadata,
} from "@/types/printBook";

export interface SpreadPreview {
  id: string;
  sequence: number;
  title?: string;
  layoutType: BookSpread["layoutType"];
  thumbnailUrl?: string;
  webImageUrl?: string;
  leftPageImageUrl?: string;
  rightPageImageUrl?: string;
  leftPageImageError?: string;
  rightPageImageError?: string;
  leftPageQa?: IllustrationGenerationMetadata;
  rightPageQa?: IllustrationGenerationMetadata;
}

export type ReviewArtworkSide = "left" | "right";

export interface ExpandedImageTarget {
  spreadId: string;
  sequence: number;
  title?: string;
  side: ReviewArtworkSide;
  url?: string;
  displayLabel?: string;
  index?: number;
}

export interface ArtworkPreview {
  preview: SpreadPreview;
  side: ReviewArtworkSide;
  url?: string;
  error?: string;
  qa?: IllustrationGenerationMetadata;
}

export function isPlaceholderImageUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

export function getArtworkSideLabel(side: ReviewArtworkSide): string {
  return side === "left" ? "Left page" : "Right page";
}

export function getArtworkUrl(
  preview: SpreadPreview | undefined,
  side: ReviewArtworkSide
): string | undefined {
  if (!preview) return undefined;
  return side === "left"
    ? preview.webImageUrl ?? preview.thumbnailUrl ?? preview.leftPageImageUrl
    : preview.rightPageImageUrl;
}

export function getArtworkError(
  preview: SpreadPreview | undefined,
  side: ReviewArtworkSide
): string | undefined {
  if (!preview) return undefined;
  return side === "left"
    ? preview.leftPageImageError
    : preview.rightPageImageError;
}

export function getArtworkQa(
  preview: SpreadPreview | undefined,
  side: ReviewArtworkSide
): IllustrationGenerationMetadata | undefined {
  if (!preview) return undefined;
  return side === "left" ? preview.leftPageQa : preview.rightPageQa;
}

export function hasStoredArtworkSide(
  preview: SpreadPreview,
  side: ReviewArtworkSide
): boolean {
  return Boolean(
    getArtworkUrl(preview, side) ||
      getArtworkError(preview, side) ||
      getArtworkQa(preview, side)
  );
}

export function toSpreadPreview(spread: BookSpread): SpreadPreview {
  return {
    id: spread.id,
    sequence: spread.sequence,
    title: spread.title,
    layoutType: spread.layoutType,
    thumbnailUrl:
      spread.thumbnailUrl ??
      spread.leftPageWebImageUrl ??
      spread.imageUrl ??
      undefined,
    webImageUrl: spread.leftPageWebImageUrl ?? spread.thumbnailUrl ?? undefined,
    leftPageImageUrl: spread.leftPageImageUrl ?? spread.imageUrl ?? undefined,
    rightPageImageUrl: spread.rightPageImageUrl,
    leftPageImageError: spread.leftPageImageError,
    rightPageImageError: spread.rightPageImageError,
    leftPageQa: spread.leftPageQa,
    rightPageQa: spread.rightPageQa,
  };
}

export function getSpreadPreviews(
  project: Pick<BookProject, "spreads">
): SpreadPreview[] {
  const seen = new Set<string>();
  return project.spreads
    .filter((spread) => {
      if (seen.has(spread.id)) return false;
      seen.add(spread.id);
      return (
        spread.layoutType === "text_art" ||
        spread.layoutType === "hero" ||
        spread.layoutType === "quiet"
      );
    })
    .map(toSpreadPreview)
    .sort((a, b) => a.sequence - b.sequence);
}

export function getArtworkPreviews(
  spreads: SpreadPreview[]
): ArtworkPreview[] {
  return spreads.flatMap((preview) => {
    const left: ArtworkPreview = {
      preview,
      side: "left",
      url: getArtworkUrl(preview, "left"),
      error: getArtworkError(preview, "left"),
      qa: getArtworkQa(preview, "left"),
    };
    const entries = [left];
    if (hasStoredArtworkSide(preview, "right")) {
      entries.push({
        preview,
        side: "right",
        url: getArtworkUrl(preview, "right"),
        error: getArtworkError(preview, "right"),
        qa: getArtworkQa(preview, "right"),
      });
    }
    return entries;
  });
}

function buildImageTarget(
  preview: SpreadPreview,
  side: ReviewArtworkSide
): ExpandedImageTarget {
  return {
    spreadId: preview.id,
    sequence: preview.sequence,
    title: preview.title,
    side,
    url: getArtworkUrl(preview, side),
  };
}

export function getFailedImageTargets(
  spreads: SpreadPreview[]
): ExpandedImageTarget[] {
  return spreads.flatMap((preview) => {
    const targets: ExpandedImageTarget[] = [];
    if (preview.leftPageImageError || !preview.leftPageImageUrl) {
      targets.push(buildImageTarget(preview, "left"));
    }
    if (
      hasStoredArtworkSide(preview, "right") &&
      (preview.rightPageImageError || !preview.rightPageImageUrl)
    ) {
      targets.push(buildImageTarget(preview, "right"));
    }
    return targets;
  });
}

export function getRepairImageTargets(
  spreads: SpreadPreview[]
): ExpandedImageTarget[] {
  return spreads.flatMap((preview) => {
    const targets: ExpandedImageTarget[] = [];
    if (
      preview.leftPageImageError ||
      !preview.leftPageImageUrl ||
      isPlaceholderImageUrl(preview.leftPageImageUrl)
    ) {
      targets.push(buildImageTarget(preview, "left"));
    }
    if (
      hasStoredArtworkSide(preview, "right") &&
      (preview.rightPageImageError ||
        !preview.rightPageImageUrl ||
        isPlaceholderImageUrl(preview.rightPageImageUrl))
    ) {
      targets.push(buildImageTarget(preview, "right"));
    }
    return targets;
  });
}

export function getArtworkRiskFlags(
  preview: SpreadPreview,
  side: ReviewArtworkSide
): string[] {
  const qa = getArtworkQa(preview, side);
  const flags: string[] = [];

  if (getArtworkError(preview, side)) flags.push("Generation failed");
  if (!qa) return flags;

  if (qa.characterReferenceIds.length === 0) {
    flags.push("No character references used");
  }
  if (qa.continuityReferenceIds.length === 0 && preview.sequence > 2) {
    flags.push("No continuity references used");
  }
  if (qa.staleCharacterReferenceNames?.length) {
    flags.push(`Stale refs: ${qa.staleCharacterReferenceNames.join(", ")}`);
  }
  if (qa.pageTextOmitted) flags.push("Fallback used");
  if (qa.correctionNote) flags.push("Manual correction redo");

  return flags;
}
