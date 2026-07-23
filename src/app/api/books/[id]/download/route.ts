import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { buildBookEpub } from "@/lib/print-books/epub";
import JSZip from "jszip";

type AssetKey = "printPdf" | "epub" | "luluPrintPdf" | "luluCoverPdf" | "illustrationsZip";

function getAsset(
  project: Awaited<ReturnType<typeof db.bookProjects.getById>>,
  asset: AssetKey
) {
  if (!project) return undefined;
  if (asset === "printPdf") return project.assets.printPdfUrl;
  if (asset === "luluPrintPdf") return project.assets.luluPrintPdfUrl;
  if (asset === "luluCoverPdf") return project.assets.luluCoverPdfUrl;
  return project.assets.epubUrl;
}

function getContentType(asset: AssetKey): string {
  return asset === "epub" ? "application/epub+zip" : "application/pdf";
}

function safeFilename(title: string, ext: string): string {
  const slug = title
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return slug ? `${slug}.${ext}` : `storycot.${ext}`;
}

function getFilename(asset: AssetKey, storyTitle?: string): string {
  const ext = asset === "printPdf" ? "pdf" : "epub";
  if (asset === "luluPrintPdf") {
    return storyTitle
      ? safeFilename(`${storyTitle} Lulu interior`, "pdf")
      : "storycot-lulu-interior.pdf";
  }
  if (asset === "luluCoverPdf") {
    return storyTitle
      ? safeFilename(`${storyTitle} Lulu cover`, "pdf")
      : "storycot-lulu-cover.pdf";
  }
  if (storyTitle) return safeFilename(storyTitle, ext);
  return asset === "printPdf" ? "storycot-illustrated.pdf" : "storycot.epub";
}

function parseDataUrl(
  value: string
): { body: Buffer; contentType: string } | undefined {
  const match = value.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) return undefined;

  const contentType = match[1]!;
  const isBase64 = Boolean(match[2]);
  const rawBody = match[3]!;
  return {
    body: isBase64
      ? Buffer.from(rawBody, "base64")
      : Buffer.from(decodeURIComponent(rawBody), "utf8"),
    contentType,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const asset = req.nextUrl.searchParams.get("asset") as AssetKey | null;
  if (
    asset !== "printPdf" &&
    asset !== "epub" &&
    asset !== "luluPrintPdf" &&
    asset !== "luluCoverPdf" &&
    asset !== "illustrationsZip"
  ) {
    return NextResponse.json({ error: "Invalid asset" }, { status: 400 });
  }

  const { id } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const story = await db.stories.getById(project.sourceStoryId);
  const filename = getFilename(asset, story?.title);

  if (asset === "illustrationsZip") {
    const zip = new JSZip();
    const folder = zip.folder("illustrations") ?? zip;

    const coverUrl = project.assets.coverImageUrl;
    if (coverUrl && !coverUrl.endsWith(".svg") && !coverUrl.startsWith("data:image/svg")) {
      const r = await fetch(coverUrl);
      if (r.ok) folder.file("cover.jpg", r.arrayBuffer());
    }

    const spreads = project.spreads
      .filter(
        (s) =>
          s.layoutType === "text_art" ||
          s.layoutType === "hero" ||
          s.layoutType === "quiet"
      )
      .sort((a, b) => a.sequence - b.sequence);

    await Promise.all(
      spreads.map(async (s, i) => {
        const url = s.leftPageImageUrl ?? s.imageUrl;
        if (!url || url.endsWith(".svg") || url.startsWith("data:image/svg")) return;
        const r = await fetch(url);
        if (!r.ok) return;
        const pad = String(i + 1).padStart(2, "0");
        folder.file(`illustration-${pad}.jpg`, r.arrayBuffer());
      })
    );

    const nodeBuf = await zip.generateAsync({ type: "nodebuffer" });
    const buf = new Uint8Array(nodeBuf);
    const zipName = story?.title
      ? safeFilename(story.title, "zip").replace(/\.zip$/, "-illustrations.zip")
      : "storycot-illustrations.zip";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (asset === "epub" && story) {
    const profile = await db.profiles.getById(project.profileId);
    if (profile && profile.userId === userId) {
      const epub = await buildBookEpub({ project, story, profile });
      return new NextResponse(new Uint8Array(epub), {
        headers: {
          "Content-Type": getContentType(asset),
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
  }

  const url = getAsset(project, asset);
  if (!url) {
    if (project.assets.downloadableFilesArchivedAt) {
      return NextResponse.json(
        {
          error:
            "This book's high-resolution files have been archived. Refresh PDFs to prepare fresh files.",
        },
        { status: 410 }
      );
    }
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (!url.startsWith("data:")) {
    // Proxy the blob through the API rather than redirecting. Download/share
    // buttons fetch same-origin files so mobile browsers keep predictable
    // behavior.
    const blobRes = await fetch(url);
    if (!blobRes.ok) {
      return NextResponse.json(
        { error: "Asset unavailable from storage" },
        { status: 502 }
      );
    }
    return new NextResponse(blobRes.body ?? new Uint8Array(), {
      headers: {
        "Content-Type": getContentType(asset),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const parsed = parseDataUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid inline asset" },
      { status: 500 }
    );
  }

  return new NextResponse(new Uint8Array(parsed.body), {
    headers: {
      "Content-Type": parsed.contentType || getContentType(asset),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
