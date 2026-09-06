import { db } from "@/lib/db";
import type { Story } from "@/types";
import type { BookProject, BookSpread } from "@/types/printBook";

export type SharedStorySpread = {
  id: string;
  sequence: number;
  title?: string;
  text: string;
  imageUrl?: string;
};

export type SharedStory = {
  story: Story;
  project?: BookProject;
  coverImageUrl?: string;
  spreads: SharedStorySpread[];
  narrationEnabled: boolean;
};

function isPlaceholderImage(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

function isStorySpread(spread: BookSpread): boolean {
  return (
    spread.layoutType === "text_art" ||
    spread.layoutType === "hero" ||
    spread.layoutType === "quiet"
  );
}

function imageForSpread(spread: BookSpread): string | undefined {
  const imageUrl =
    spread.leftPageWebImageUrl ??
    spread.thumbnailUrl ??
    spread.leftPageImageUrl ??
    spread.imageUrl;
  return isPlaceholderImage(imageUrl) ? undefined : imageUrl;
}

function projectToSharedSpreads(project: BookProject): SharedStorySpread[] {
  const seen = new Set<string>();
  return project.spreads
    .filter((spread) => {
      if (seen.has(spread.id)) return false;
      seen.add(spread.id);
      return isStorySpread(spread);
    })
    .sort((a, b) => a.sequence - b.sequence)
    .map((spread) => ({
      id: spread.id,
      sequence: spread.sequence,
      title: spread.title,
      text: [spread.leftPageText, spread.rightPageText]
        .filter(Boolean)
        .join(" ")
        .trim(),
      imageUrl: imageForSpread(spread),
    }))
    .filter((spread) => spread.text || spread.imageUrl);
}

function selectSharedProject(projects: BookProject[]): BookProject | undefined {
  return projects
    .filter((project) => project.status === "ready")
    .sort((a, b) => {
      const aTime = Date.parse(a.readyAt ?? a.updatedAt ?? a.createdAt);
      const bTime = Date.parse(b.readyAt ?? b.updatedAt ?? b.createdAt);
      return bTime - aTime;
    })[0];
}

/**
 * A story is only reachable by its share token while the owner keeps it shared.
 * Admin delisting/owner withdrawal set visibility to `private` and/or review
 * status to `rejected`, which must revoke the previously distributed link
 * immediately — regardless of whether its book art is still `ready`.
 *
 * Backward compatible: stories shared before `visibility` was tracked have it
 * `undefined`; those remain shareable. Only an explicit `private` visibility or
 * a `rejected` review status revokes access.
 */
export function isStoryShareable(
  story: Pick<Story, "visibility" | "publicReviewStatus">
): boolean {
  if (story.publicReviewStatus === "rejected") return false;
  return story.visibility !== "private";
}

export async function getSharedStoryByToken(
  token: string
): Promise<SharedStory | undefined> {
  const story = await db.stories.getByShareToken(token);
  if (!story) return undefined;
  if (!isStoryShareable(story)) return undefined;

  const project = selectSharedProject(
    await db.bookProjects.getByStoryId(story.id)
  );
  const coverImageUrl =
    project && !isPlaceholderImage(project.assets.coverWebImageUrl)
      ? project.assets.coverWebImageUrl
      : project && !isPlaceholderImage(project.assets.coverImageUrl)
        ? project.assets.coverImageUrl
        : undefined;
  if (!project || !coverImageUrl) return undefined;

  return {
    story,
    project,
    coverImageUrl,
    spreads: projectToSharedSpreads(project),
    narrationEnabled: Boolean(project?.assets.digitalDownloadUnlockedAt),
  };
}
