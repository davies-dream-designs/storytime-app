import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

type AssetKey = "printPdf" | "epub";

function getAsset(
  project: Awaited<ReturnType<typeof db.bookProjects.getById>>,
  asset: AssetKey
) {
  if (!project) return undefined;
  if (asset === "printPdf") return project.assets.printPdfUrl;
  return project.assets.epubUrl;
}

function getContentType(asset: AssetKey): string {
  return asset === "printPdf" ? "application/pdf" : "application/epub+zip";
}

function getFilename(asset: AssetKey): string {
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
  if (asset !== "printPdf" && asset !== "epub") {
    return NextResponse.json({ error: "Invalid asset" }, { status: 400 });
  }

  const { id } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = getAsset(project, asset);
  if (!url) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (!url.startsWith("data:")) {
    return NextResponse.redirect(url);
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
      "Content-Disposition": `attachment; filename="${getFilename(asset)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
