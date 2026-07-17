import JSZip from "jszip";
import sharp from "sharp";
import type { ChildProfile, Story } from "@/types";
import type { BookProject, BookSpread } from "@/types/printBook";
import { storeBookAsset } from "@/lib/print-books/storage";

type EpubImageAsset = {
  id: string;
  href: string;
  mediaType: string;
  bytes: Buffer;
};

const KINDLE_SEND_TO_DEVICE_LIMIT_BYTES = 50 * 1024 * 1024;
const EPUB_TARGET_MAX_BYTES = 45 * 1024 * 1024;
const EPUB_IMAGE_MAX_BYTES = 850 * 1024;
const EPUB_IMAGE_MAX_WIDTH = 960;
const EPUB_IMAGE_QUALITY = 62;
const EPUB_COVER_WIDTH = 900;
const EPUB_COVER_HEIGHT = 1200;

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
  const widths = [options.maxWidth ?? EPUB_IMAGE_MAX_WIDTH, 820, 700, 560];
  const qualities = [options.quality ?? EPUB_IMAGE_QUALITY, 56, 48, 40, 34];

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

function createTextCoverArtSvg(input: { story: Story }) {
  const source =
    `${input.story.title} ${input.story.theme || ""} ${input.story.pages
      .map((page) => `${page.text} ${page.illustrationPrompt || ""}`)
      .join(" ")}`.toLowerCase();
  const isOcean = /(wave|ocean|sea|beach|shore|sand|pebble|shell|tide)/.test(
    source
  );
  const isGarden =
    /(garden|flower|forest|tree|leaf|meadow|field|fox|rabbit|bunny|frog)/.test(
      source
    );
  const isNight = /(moon|star|night|sleep|dream|sky|cloud)/.test(source);
  const palette = isOcean
    ? {
        skyTop: "#22315e",
        skyMid: "#5f6fa8",
        skyBottom: "#f4d49d",
        hillBack: "#2b4b77",
        hillFront: "#1d3158",
        accent: "#ffd66e",
        motif: "ocean",
      }
    : isGarden
      ? {
          skyTop: "#25454f",
          skyMid: "#6b8a73",
          skyBottom: "#f7d9a2",
          hillBack: "#335f45",
          hillFront: "#233f31",
          accent: "#ffd36a",
          motif: "garden",
        }
      : isNight
        ? {
            skyTop: "#211f4a",
            skyMid: "#675bb2",
            skyBottom: "#d9b1dc",
            hillBack: "#263968",
            hillFront: "#19274e",
            accent: "#fff1b8",
            motif: "night",
          }
        : {
            skyTop: "#26324f",
            skyMid: "#6b6db0",
            skyBottom: "#f3c58e",
            hillBack: "#34456d",
            hillFront: "#212b4d",
            accent: "#ffd36a",
            motif: "adventure",
          };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.skyTop}"/>
      <stop offset="58%" stop-color="${palette.skyMid}"/>
      <stop offset="100%" stop-color="${palette.skyBottom}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1600" fill="url(#sky)"/>
  <circle cx="930" cy="220" r="115" fill="${palette.accent}" opacity="0.95"/>
  <circle cx="930" cy="220" r="170" fill="${palette.accent}" opacity="0.14"/>
  <circle cx="220" cy="210" r="5" fill="#fff6de" opacity="0.8"/>
  <circle cx="280" cy="286" r="4" fill="#fff6de" opacity="0.6"/>
  <circle cx="1045" cy="390" r="5" fill="#fff6de" opacity="0.7"/>
  <path d="M0 1128 C170 1058 350 1026 510 1062 C690 1102 812 1180 980 1150 C1070 1135 1142 1094 1200 1060 L1200 1600 L0 1600 Z" fill="${palette.hillBack}"/>
  <path d="M0 1242 C180 1192 360 1180 520 1214 C710 1256 830 1340 1015 1304 C1095 1288 1160 1255 1200 1230 L1200 1600 L0 1600 Z" fill="${palette.hillFront}" opacity="0.94"/>
  <rect x="116" y="116" width="968" height="1368" rx="56" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="6"/>
  ${
    palette.motif === "ocean"
      ? `<path d="M245 1030 C380 998 478 990 596 1012 C700 1032 778 1066 884 1054 C972 1044 1040 1000 1125 962" fill="none" stroke="#fff4cd" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
         <circle cx="560" cy="970" r="22" fill="${palette.accent}" opacity="0.85"/>
         <circle cx="615" cy="948" r="15" fill="#fff8dc" opacity="0.78"/>`
      : palette.motif === "garden"
        ? `<path d="M570 980 C552 918 570 860 615 820" fill="none" stroke="#fff4cd" stroke-width="10" stroke-linecap="round"/>
           <path d="M660 980 C685 922 676 860 628 820" fill="none" stroke="#fff4cd" stroke-width="10" stroke-linecap="round"/>
           <circle cx="616" cy="805" r="34" fill="${palette.accent}" opacity="0.9"/>
           <circle cx="660" cy="812" r="30" fill="#fff4cd" opacity="0.75"/>
           <circle cx="635" cy="760" r="26" fill="${palette.accent}" opacity="0.82"/>`
        : `<circle cx="568" cy="948" r="28" fill="${palette.accent}" opacity="0.86"/>
           <circle cx="622" cy="918" r="19" fill="#fff8dc" opacity="0.8"/>
           <circle cx="668" cy="956" r="14" fill="${palette.accent}" opacity="0.72"/>
           <path d="M590 1084 L615 1028 L640 1084" fill="none" stroke="#fff4cd" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0.78"/>`
  }
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

  const cover = await sharp(Buffer.from(createTextCoverArtSvg(input)))
    .resize(EPUB_COVER_WIDTH, EPUB_COVER_HEIGHT, { fit: "cover" })
    .flatten({ background: "#ffffff" })
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
}): Promise<EpubImageAsset | undefined> {
  if (!input.url) return undefined;

  const dataAsset = getDataUrlAsset(input.url);
  if (dataAsset) {
    const compact = await toCompactJpeg(dataAsset.bytes);
    return {
      id: input.id,
      href: `images/${input.id}.jpg`,
      mediaType: "image/jpeg",
      bytes: compact,
    };
  }

  const response = await fetch(input.url);
  if (!response.ok) return undefined;
  const compact = await toCompactJpeg(
    Buffer.from(await response.arrayBuffer())
  );
  return {
    id: input.id,
    href: `images/${input.id}.jpg`,
    mediaType: "image/jpeg",
    bytes: compact,
  };
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
  variant?: "cover" | "story";
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
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles/storycot.css" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <section class="${isCover ? "cover-page" : "page"}">
      ${isCover ? `<p class="brand">Storycot</p>` : ""}
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

function getStylesheet(): string {
  return `@page {
  margin: 8%;
}

html, body {
  margin: 0;
  padding: 0;
}

body {
  font-family: Georgia, "Times New Roman", serif;
}

.page {
  box-sizing: border-box;
  padding: 0;
}

.cover-page {
  box-sizing: border-box;
  page-break-after: always;
  text-align: center;
}

.brand {
  color: #2b1b5d;
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
  margin: 0 auto 1.5rem;
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
      const asset = await loadImageAsset({ id, url });
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

  const coverImageHref = await addImage("cover", project.assets.coverImageUrl);
  const pages: Array<{
    id: string;
    href: string;
    title: string;
    content: string;
  }> = [];
  pages.push({
    id: "cover-page",
    href: "cover.xhtml",
    title,
    content: renderPageXhtml({
      title,
      heading: title,
      imageHref: coverImageHref,
      body: `A Storycot story for ${profile.name}.`,
      variant: "cover",
    }),
  });

  for (const spread of project.spreads) {
    if (spread.sequence === 1 || spread.title === "Cover") continue;

    const leftImageHref = await addImage(
      `spread-${spread.sequence}-left`,
      getImageSource(spread, "left")
    );
    const rightImageHref = await addImage(
      `spread-${spread.sequence}-right`,
      getImageSource(spread, "right")
    );

    if (spread.leftPageText || leftImageHref) {
      pages.push({
        id: `spread-${spread.sequence}-left`,
        href: `spread-${spread.sequence}-left.xhtml`,
        title: `${title} - Page ${spread.pageStart}`,
        content: renderPageXhtml({
          title,
          heading: spread.title || title,
          imageHref: leftImageHref,
          body: spread.leftPageText,
          pageLabel: `Page ${spread.pageStart}`,
        }),
      });
    }

    if (spread.rightPageText || rightImageHref) {
      pages.push({
        id: `spread-${spread.sequence}-right`,
        href: `spread-${spread.sequence}-right.xhtml`,
        title: `${title} - Page ${spread.pageEnd}`,
        content: renderPageXhtml({
          title,
          heading: spread.title || title,
          imageHref: rightImageHref,
          body: spread.rightPageText,
          pageLabel: `Page ${spread.pageEnd}`,
        }),
      });
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

  const manifestItems = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
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
  </metadata>
  <manifest>
    ${manifestItems.join("\n")}
  </manifest>
  <spine>
    ${pages.map((page) => `<itemref idref="${escapeXml(page.id)}" />`).join("\n")}
  </spine>
</package>`
  );

  const epub = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  if (
    !input.compact &&
    epub.length > EPUB_TARGET_MAX_BYTES &&
    epub.length < KINDLE_SEND_TO_DEVICE_LIMIT_BYTES * 2
  ) {
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
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="css" href="styles/storycot.css" media-type="text/css" />
    <item id="cover" href="${coverAsset.href}" media-type="${coverAsset.mediaType}" properties="cover-image" />
    ${pages.map((page) => `<item id="${escapeXml(page.id)}" href="${escapeXml(page.href)}" media-type="application/xhtml+xml" />`).join("\n")}
  </manifest>
  <spine>
    ${pages.map((page) => `<itemref idref="${escapeXml(page.id)}" />`).join("\n")}
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
    pathname: `books/${input.project.id}/storycot.epub`,
    body: epub,
    contentType: "application/epub+zip",
  });

  return { epubUrl };
}
