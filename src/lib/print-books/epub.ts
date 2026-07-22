import JSZip from "jszip";
import sharp from "sharp";
import type { ChildProfile, Story } from "@/types";
import type { BookProject, BookSpread } from "@/types/printBook";
import { storeBookAsset } from "@/lib/print-books/storage";
import { toEpubFilename } from "@/lib/print-books/filename";

type EpubImageAsset = {
  id: string;
  href: string;
  mediaType: string;
  bytes: Buffer;
};

const EPUB_TARGET_MAX_BYTES = 45 * 1024 * 1024;
const EPUB_IMAGE_MAX_BYTES = 1500 * 1024;
const EPUB_IMAGE_MAX_WIDTH = 1400;
const EPUB_IMAGE_QUALITY = 74;
const EPUB_COVER_WIDTH = 1600;
const EPUB_COVER_HEIGHT = 2560;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitParagraphs(value: string): string[] {
  return value
    .split(/\n{2,}/)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function getImageSource(
  spread: BookSpread,
  side: "left" | "right"
): string | undefined {
  if (side === "left") return spread.leftPageImageUrl ?? spread.imageUrl;
  return spread.rightPageImageUrl ?? spread.imageUrl;
}

function getDataUrlAsset(
  url: string
): { bytes: Buffer; mediaType: string } | null {
  const match = url.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) return null;

  const mediaType = match[1]!;
  const isBase64 = Boolean(match[2]);
  const body = match[3]!;
  return {
    bytes: isBase64
      ? Buffer.from(body, "base64")
      : Buffer.from(decodeURIComponent(body), "utf8"),
    mediaType,
  };
}

async function toCompactJpeg(
  bytes: Buffer,
  options: {
    maxWidth?: number;
    maxBytes?: number;
    quality?: number;
  } = {}
): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? EPUB_IMAGE_MAX_BYTES;
  const initialWidth = options.maxWidth ?? EPUB_IMAGE_MAX_WIDTH;
  const widths = [
    initialWidth,
    Math.min(initialWidth, 1400),
    Math.min(initialWidth, 1200),
    960,
    760,
  ].filter(
    (width, index, values) => width > 0 && values.indexOf(width) === index
  );
  const qualities = [options.quality ?? EPUB_IMAGE_QUALITY, 68, 60, 52, 44];

  let smallest: Buffer | undefined;

  for (const width of widths) {
    for (const quality of qualities) {
      const output = await sharp(bytes)
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({
          width,
          height: width,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();

      if (!smallest || output.length < smallest.length) smallest = output;
      if (output.length <= maxBytes) return output;
    }
  }

  return smallest ?? bytes;
}

async function toCoverJpeg(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .flatten({ background: "#2b1b5d" })
    .resize(EPUB_COVER_WIDTH, EPUB_COVER_HEIGHT, {
      fit: "contain",
      background: "#2b1b5d",
      withoutEnlargement: false,
    })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}

function createBrandedCoverSvg(input: {
  story: Story;
  profile?: ChildProfile;
}): string {
  const title = input.story.title || "Storycot Story";
  const forLine = input.profile
    ? `A story for ${input.profile.name}.`
    : "A Storycot story.";

  const words = title.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > 18) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  const fontSize = lines.length > 2 ? 62 : 76;
  const lineHeight = fontSize * 1.25;
  const totalH = lines.length * lineHeight;
  const titleStartY = 560 - totalH / 2 + fontSize;

  const titleSvg = lines
    .map(
      (line, i) =>
        `<text x="450" y="${titleStartY + i * lineHeight}" font-family="serif" font-size="${fontSize}" fill="#fff8e7" text-anchor="middle" font-weight="bold">${escapeXml(line)}</text>`
    )
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <rect width="900" height="1200" fill="#2b1b5d"/>
  <circle cx="680" cy="200" r="90" fill="#ffd66e" opacity="0.12"/>
  <circle cx="680" cy="200" r="58" fill="#ffd66e" opacity="0.18"/>
  <circle cx="680" cy="200" r="36" fill="#ffd66e" opacity="0.88"/>
  <circle cx="160" cy="160" r="3" fill="#fff8e7" opacity="0.6"/>
  <circle cx="230" cy="110" r="2" fill="#ffd66e" opacity="0.7"/>
  <circle cx="740" cy="90" r="2" fill="#fff8e7" opacity="0.5"/>
  <circle cx="110" cy="280" r="1.5" fill="#fff8e7" opacity="0.4"/>
  <circle cx="810" cy="340" r="2" fill="#fff8e7" opacity="0.5"/>
  <text x="450" y="92" font-family="sans-serif" font-size="26" fill="#ffd66e" text-anchor="middle" letter-spacing="7" font-weight="700">STORYCOT</text>
  <line x1="180" y1="112" x2="720" y2="112" stroke="#ffd66e" stroke-width="1" opacity="0.35"/>
  ${titleSvg}
  <text x="450" y="830" font-family="serif" font-size="28" fill="#c4aee8" text-anchor="middle" font-style="italic">${escapeXml(forLine)}</text>
  <rect x="48" y="48" width="804" height="1104" rx="20" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
</svg>`;
}

async function createTextCoverAsset(input: {
  story: Story;
  profile?: ChildProfile;
  coverImageUrl?: string;
}): Promise<EpubImageAsset> {
  if (input.coverImageUrl) {
    const cover = await loadImageAsset({
      id: "cover",
      url: input.coverImageUrl,
    });
    if (cover) return cover;
  }

  const cover = await sharp(Buffer.from(createBrandedCoverSvg(input)))
    .resize(EPUB_COVER_WIDTH, EPUB_COVER_HEIGHT, { fit: "fill" })
    .flatten({ background: "#2b1b5d" })
    .jpeg({ quality: EPUB_IMAGE_QUALITY, mozjpeg: true })
    .toBuffer();
  return {
    id: "cover",
    href: "images/cover.jpg",
    mediaType: "image/jpeg",
    bytes: cover,
  };
}

async function loadImageAsset(input: {
  id: string;
  url?: string;
  maxWidth?: number;
  maxBytes?: number;
  quality?: number;
}): Promise<EpubImageAsset | undefined> {
  if (!input.url) return undefined;

  try {
    const dataAsset = getDataUrlAsset(input.url);
    const sourceBytes = dataAsset
      ? dataAsset.bytes
      : await (async () => {
          const response = await fetch(input.url!);
          if (!response.ok) return undefined;
          return Buffer.from(await response.arrayBuffer());
        })();

    if (!sourceBytes) return undefined;

    const compact =
      input.id === "cover"
        ? await toCoverJpeg(sourceBytes)
        : await toCompactJpeg(sourceBytes, {
            maxWidth: input.maxWidth,
            maxBytes: input.maxBytes,
            quality: input.quality,
          });
    return {
      id: input.id,
      href: `images/${input.id}.jpg`,
      mediaType: "image/jpeg",
      bytes: compact,
    };
  } catch (error) {
    console.warn("Skipping EPUB image asset that could not be loaded", {
      id: input.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function renderParagraphs(text: string): string {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return "";
  return paragraphs
    .map((paragraph) => `<p>${escapeXml(paragraph)}</p>`)
    .join("\n");
}

function renderPageXhtml(input: {
  title: string;
  heading?: string;
  imageHref?: string;
  body: string;
  pageLabel?: string;
  variant?: "cover" | "story" | "image" | "closing";
}): string {
  const {
    title,
    heading,
    imageHref,
    body,
    pageLabel,
    variant = "story",
  } = input;
  const isCover = variant === "cover";
  const isImage = variant === "image";
  const isClosing = variant === "closing";
  const sectionClass = isCover
    ? "cover-page"
    : isImage
      ? "image-page"
      : isClosing
        ? "closing-page"
        : "page";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles/storycot.css" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <section class="${sectionClass}">
      ${isCover || isClosing ? `<p class="brand">Storycot</p>` : ""}
      ${pageLabel ? `<p class="page-label">${escapeXml(pageLabel)}</p>` : ""}
      ${heading ? `<h1>${escapeXml(heading)}</h1>` : ""}
      ${imageHref ? `<img class="${isCover ? "cover-art" : "illustration"}" src="${escapeXml(imageHref)}" alt="" />` : ""}
      <div class="story-text">
        ${renderParagraphs(body)}
      </div>
    </section>
  </body>
</html>`;
}

function buildNcxXml(input: {
  identifier: string;
  title: string;
  pages: Array<{ id: string; href: string; title: string }>;
}): string {
  const { identifier, title, pages } = input;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(identifier)}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    ${pages
      .map(
        (page, i) => `<navPoint id="np-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(page.title)}</text></navLabel>
      <content src="${escapeXml(page.href)}" />
    </navPoint>`
      )
      .join("\n    ")}
  </navMap>
</ncx>`;
}

function getStylesheet(): string {
  return `html, body {
  margin: 0;
  padding: 0;
}

body {
  font-family: Georgia, "Times New Roman", serif;
}

.page {
  box-sizing: border-box;
  padding: 3rem 2rem;
  page-break-after: always;
}

.image-page {
  box-sizing: border-box;
  padding: 0;
  page-break-after: always;
}

.cover-page {
  background-color: #2b1b5d;
  box-sizing: border-box;
  color: #fff8e7;
  padding: 3rem 2rem;
  page-break-after: always;
  text-align: center;
}

.closing-page {
  background-color: #2b1b5d;
  box-sizing: border-box;
  color: #fff8e7;
  padding: 4rem 2rem;
  page-break-before: always;
  text-align: center;
}

.brand {
  color: #ffd66e;
  font: 700 0.9rem Arial, sans-serif;
  letter-spacing: 0.08em;
  margin: 0 0 1rem;
  text-transform: uppercase;
}

.page-label {
  color: #777;
  font: 700 0.75rem Arial, sans-serif;
  letter-spacing: 0.08em;
  margin: 0 0 1.25rem;
  text-transform: uppercase;
}

h1 {
  color: #2b1b5d;
  font-size: 2rem;
  line-height: 1.15;
  margin: 0 0 1rem;
  text-align: center;
}

.cover-page h1,
.closing-page h1 {
  color: #fff8e7;
}

.cover-art {
  display: block;
  height: auto;
  margin: 1rem auto;
  max-height: 72vh;
  max-width: 100%;
}

.illustration {
  display: block;
  height: auto;
  margin: 0 auto;
  max-width: 100%;
}

.story-text {
  font-size: 1.05rem;
  line-height: 1.55;
  text-align: left;
}

.story-text p {
  margin: 0 0 1.1rem;
}`;
}

export async function buildBookEpub(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  compact?: boolean;
}): Promise<Buffer> {
  const { project, story, profile } = input;
  const zip = new JSZip();
  const identifier = `storycot:${project.id}`;
  const title = story.title || "Storycot story";
  const creator = "Storycot";
  const modified = new Date(project.updatedAt || project.createdAt)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`
  );

  const imageAssets: EpubImageAsset[] = [];
  const imageAssetCache = new Map<string, Promise<string | undefined>>();
  const addImage = async (id: string, url?: string) => {
    if (!url) return undefined;
    const cached = imageAssetCache.get(url);
    if (cached) return cached;

    const promise = (async () => {
      const asset = await loadImageAsset({
        id,
        url,
        maxWidth: id === "cover" ? EPUB_COVER_WIDTH : undefined,
        maxBytes: id === "cover" ? 2200 * 1024 : undefined,
        quality: id === "cover" ? 78 : undefined,
      });
      if (!asset) return undefined;
      if (input.compact) {
        asset.bytes = await toCompactJpeg(asset.bytes, {
          maxWidth: 700,
          maxBytes: 520 * 1024,
          quality: 48,
        });
      }
      imageAssets.push(asset);
      return asset.href;
    })();
    imageAssetCache.set(url, promise);
    return promise;
  };

  let coverImageHref = await addImage("cover", project.assets.coverImageUrl);
  if (!coverImageHref) {
    const coverAsset = await createTextCoverAsset({ story, profile });
    imageAssets.push(coverAsset);
    coverImageHref = coverAsset.href;
  }
  const pages: Array<{
    id: string;
    href: string;
    title: string;
    content: string;
  }> = [];
  let readingPageNumber = 1;

  for (const spread of project.spreads) {
    // Skip print-only structural spreads. The cover image remains in EPUB
    // metadata, but front/back matter should not become Kindle reading pages.
    if (
      spread.sequence === 1 ||
      spread.title === "Cover" ||
      spread.title === "Title" ||
      spread.title === "Back Cover"
    )
      continue;

    const leftImageHref = await addImage(
      `img-spread-${spread.sequence}-left`,
      getImageSource(spread, "left")
    );
    const rightImageHref = await addImage(
      `img-spread-${spread.sequence}-right`,
      getImageSource(spread, "right")
    );

    const pageEntries: Array<{
      side: "left" | "right";
      body: string;
      imageHref?: string;
    }> = [
      { side: "left", body: spread.leftPageText, imageHref: leftImageHref },
      { side: "right", body: spread.rightPageText, imageHref: rightImageHref },
    ];

    for (const entry of pageEntries) {
      if (entry.body || entry.imageHref) {
        pages.push({
          id: `spread-${spread.sequence}-${entry.side}`,
          href: `spread-${spread.sequence}-${entry.side}.xhtml`,
          title: `${title} - Page ${readingPageNumber}`,
          content: renderPageXhtml({
            title,
            body: entry.body,
            imageHref: entry.imageHref,
          }),
        });
        readingPageNumber += 1;
      }
    }
  }

  for (const page of pages) {
    zip.file(`OEBPS/${page.href}`, page.content);
  }

  for (const image of imageAssets) {
    zip.file(`OEBPS/${image.href}`, image.bytes);
  }

  zip.file("OEBPS/styles/storycot.css", getStylesheet());
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
  <head>
    <title>${escapeXml(title)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>${escapeXml(title)}</h1>
      <ol>
        ${pages.map((page) => `<li><a href="${escapeXml(page.href)}">${escapeXml(page.title)}</a></li>`).join("\n")}
      </ol>
    </nav>
  </body>
</html>`
  );

  zip.file("OEBPS/toc.ncx", buildNcxXml({ identifier, title, pages }));

  const manifestItems = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />',
    '<item id="css" href="styles/storycot.css" media-type="text/css" />',
    ...pages.map(
      (page) =>
        `<item id="${escapeXml(page.id)}" href="${escapeXml(page.href)}" media-type="application/xhtml+xml" />`
    ),
    ...imageAssets.map((image) => {
      const properties =
        image.id === "cover" ? ' properties="cover-image"' : "";
      return `<item id="${escapeXml(image.id)}" href="${escapeXml(image.href)}" media-type="${escapeXml(image.mediaType)}"${properties} />`;
    }),
  ];

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(creator)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:publisher>Storycot</dc:publisher>
    <meta property="dcterms:modified">${modified}</meta>
    <meta name="cover" content="cover" />
  </metadata>
  <manifest>
    ${manifestItems.join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${pages.map((page) => `<itemref idref="${escapeXml(page.id)}" />`).join("\n    ")}
  </spine>
</package>`
  );

  const epub = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  if (!input.compact && epub.length > EPUB_TARGET_MAX_BYTES) {
    return buildBookEpub({ ...input, compact: true });
  }

  return epub;
}

export async function buildStoryTextEpub(input: {
  story: Story;
  profile?: ChildProfile;
  coverImageUrl?: string;
}): Promise<Buffer> {
  const { story, profile } = input;
  const zip = new JSZip();
  const identifier = `storycot:story:${story.id}`;
  const title = story.title || "Storycot story";
  const modified = new Date(story.createdAt)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const coverAsset = await createTextCoverAsset({
    story,
    profile,
    coverImageUrl: input.coverImageUrl,
  });

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`
  );

  const pages = [
    {
      id: "title-page",
      href: "title.xhtml",
      title,
      content: renderPageXhtml({
        title,
        heading: title,
        imageHref: coverAsset.href,
        body: profile
          ? `A Storycot story for ${profile.name}.`
          : "A Storycot story.",
        variant: "cover",
      }),
    },
    ...story.pages.map((page) => ({
      id: `page-${page.pageNumber}`,
      href: `page-${page.pageNumber}.xhtml`,
      title: `${title} - Page ${page.pageNumber}`,
      content: renderPageXhtml({
        title,
        heading: undefined,
        body: page.text,
        pageLabel: `Page ${page.pageNumber}`,
      }),
    })),
  ];

  for (const page of pages) {
    zip.file(`OEBPS/${page.href}`, page.content);
  }

  zip.file(`OEBPS/${coverAsset.href}`, coverAsset.bytes);
  zip.file("OEBPS/styles/storycot.css", getStylesheet());
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
  <head>
    <title>${escapeXml(title)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>${escapeXml(title)}</h1>
      <ol>
        ${pages.map((page) => `<li><a href="${escapeXml(page.href)}">${escapeXml(page.title)}</a></li>`).join("\n")}
      </ol>
    </nav>
  </body>
</html>`
  );

  zip.file("OEBPS/toc.ncx", buildNcxXml({ identifier, title, pages }));

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>Storycot</dc:creator>
    <dc:language>en</dc:language>
    <dc:publisher>Storycot</dc:publisher>
    <meta property="dcterms:modified">${modified}</meta>
    <meta name="cover" content="cover" />
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="css" href="styles/storycot.css" media-type="text/css" />
    <item id="cover" href="${coverAsset.href}" media-type="${coverAsset.mediaType}" properties="cover-image" />
    ${pages.map((page) => `<item id="${escapeXml(page.id)}" href="${escapeXml(page.href)}" media-type="application/xhtml+xml" />`).join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${pages.map((page) => `<itemref idref="${escapeXml(page.id)}" />`).join("\n    ")}
  </spine>
</package>`
  );

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function generateBookEpub(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
}): Promise<{ epubUrl: string }> {
  const epub = await buildBookEpub(input);
  const epubUrl = await storeBookAsset({
    pathname: `books/${input.project.id}/${toEpubFilename(input.story.title)}`,
    body: epub,
    contentType: "application/epub+zip",
  });

  return { epubUrl };
}
