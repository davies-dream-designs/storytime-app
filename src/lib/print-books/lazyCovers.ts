import { db } from "@/lib/db";
import { buildCoverPdf } from "@/lib/print-books/pdf/builders";
import { storeBookAsset } from "@/lib/print-books/storage";
import { getLuluFlatCoverSpineWidthIn } from "@/lib/print-books/lulu";
import {
  LULU_FLAT_COVER_PDF_GEOMETRY,
  LULU_COIL_COVER_PDF_GEOMETRY,
} from "@/lib/print-books/pdf/constants";
import type { BookProject } from "@/types/printBook";
import type { ChildProfile, Story } from "@/types";

type FlatCoverProductKey = "paperback" | "coil";

/**
 * Returns the Lulu cover PDF URL for a paperback/coil order, generating and
 * caching it on first request for that (project, productKey) pair.
 *
 * Hardcover is intentionally excluded — its cover is still generated eagerly
 * during the normal book build (generateBookPdfs), unchanged, since it's
 * the default/most common format and already fully live-tested.
 *
 * Lazy because most books are only ever ordered in a single format: eagerly
 * building all three Lulu covers on every book build would triple PDF
 * render + storage cost for formats that may never be purchased.
 */
export async function getOrCreateLuluCoverPdfUrl(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  productKey: FlatCoverProductKey;
}): Promise<string> {
  const { project, productKey } = input;
  const cached = project.assets.luluFlatCoverPdfUrlByProduct?.[productKey];
  if (cached) {
    return cached;
  }

  const pageCount = project.assets.luluPrintPdfPageCount ?? project.pageCount;
  const spineWidthIn = await getLuluFlatCoverSpineWidthIn(
    pageCount,
    productKey
  );
  const geometry =
    productKey === "coil"
      ? LULU_COIL_COVER_PDF_GEOMETRY
      : LULU_FLAT_COVER_PDF_GEOMETRY;

  const coverBytes = await buildCoverPdf({
    project: input.project,
    story: input.story,
    profile: input.profile,
    geometry,
    spineWidthIn,
    productKey,
  });

  const url = await storeBookAsset({
    pathname: `books/${project.id}/lulu-cover-${productKey}.pdf`,
    body: Buffer.from(coverBytes),
    contentType: "application/pdf",
  });

  await db.bookProjects.update(project.id, {
    assets: {
      ...project.assets,
      luluFlatCoverPdfUrlByProduct: {
        ...project.assets.luluFlatCoverPdfUrlByProduct,
        [productKey]: url,
      },
    },
  });

  return url;
}
