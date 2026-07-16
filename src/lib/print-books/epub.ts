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

const EPUB_IMAGE_MAX_WIDTH = 1400;
const EPUB_IMAGE_QUALITY = 72;

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

async function toCompactJpeg(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize({
      width: EPUB_IMAGE_MAX_WIDTH,
      height: EPUB_IMAGE_MAX_WIDTH,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: EPUB_IMAGE_QUALITY, mozjpeg: true })
    .toBuffer();
}

function createTextCoverSvg(input: { story: Story; profile?: ChildProfile }) {
  const title = escapeXml(input.story.title || "Storycot story");
  const childName = escapeXml(
    input.profile?.name ?? input.story.profileName ?? ""
  );
  const subtitle = childName
    ? `A Storycot story for ${childName}`
    : "A Storycot story";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#252748"/>
      <stop offset="62%" stop-color="#6f62bb"/>
      <stop offset="100%" stop-color="#f7d897"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1600" fill="url(#sky)"/>
  <circle cx="930" cy="220" r="115" fill="#fff1b8" opacity="0.95"/>
  <circle cx="930" cy="220" r="165" fill="#fff1b8" opacity="0.12"/>
  <path d="M0 1130 C170 1060 350 1030 510 1064 C690 1102 812 1180 980 1150 C1070 1135 1142 1094 1200 1060 L1200 1600 L0 1600 Z" fill="#26355f"/>
  <path d="M0 1240 C180 1190 360 1180 520 1214 C710 1255 830 1340 1015 1304 C1095 1288 1160 1255 1200 1230 L1200 1600 L0 1600 Z" fill="#182547" opacity="0.92"/>
  <rect x="120" y="120" width="960" height="1360" rx="52" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="5"/>
  <text x="160" y="260" fill="#fff6d7" font-size="34" font-family="Arial, sans-serif" font-weight="700" letter-spacing="4">STORYCOT</text>
  <text x="160" y="470" fill="#fffdf8" font-size="82" font-family="Georgia, serif" font-weight="700">${title}</text>
  <text x="160" y="590" fill="#fff0c5" font-size="42" font-family="Georgia, serif">${escapeXml(subtitle)}</text>
  <text x="160" y="1390" fill="#fff8dd" font-size="30" font-family="Arial, sans-serif">Personalised bedtime story</text>
</svg>`;
}

async function createTextCoverAsset(input: {
  story: Story;
  profile?: ChildProfile;
}): Promise<EpubImageAsset> {
  const cover = await toCompactJpeg(Buffer.from(createTextCoverSvg(input)));
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
  heading: string;
  imageHref?: string;
  body: string;
  pageLabel?: string;
}): string {
  const { title, heading, imageHref, body, pageLabel } = input;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles/storycot.css" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <section class="page">
      ${pageLabel ? `<p class="page-label">${escapeXml(pageLabel)}</p>` : ""}
      <h1>${escapeXml(heading)}</h1>
      ${imageHref ? `<img class="illustration" src="${escapeXml(imageHref)}" alt="" />` : ""}
      <div class="story-text">
        ${renderParagraphs(body)}
      </div>
    </section>
  </body>
</html>`;
}

function getStylesheet(): string {
  return `html, body {
  margin: 0;
  padding: 0;
}

body {
  background: #fffaf0;
  color: #252748;
  font-family: Georgia, "Times New Roman", serif;
}

.page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 2rem;
}

.page-label {
  color: #6f6b85;
  font: 700 0.75rem Arial, sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  color: #252748;
  font-size: 1.8rem;
  line-height: 1.15;
  margin: 0.25rem 0 1.25rem;
}

.illustration {
  border-radius: 0.75rem;
  display: block;
  height: auto;
  margin: 0 auto 1.5rem;
  max-width: 100%;
}

.story-text {
  font-size: 1.15rem;
  line-height: 1.65;
}

.story-text p {
  margin: 0 0 1rem;
}`;
}

export async function buildBookEpub(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
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
  const addImage = async (id: string, url?: string) => {
    const asset = await loadImageAsset({ id, url });
    if (!asset) return undefined;
    imageAssets.push(asset);
    return asset.href;
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

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function buildStoryTextEpub(input: {
  story: Story;
  profile?: ChildProfile;
}): Promise<Buffer> {
  const { story, profile } = input;
  const zip = new JSZip();
  const identifier = `storycot:story:${story.id}`;
  const title = story.title || "Storycot story";
  const modified = new Date(story.createdAt)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const coverAsset = await createTextCoverAsset({ story, profile });

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
      }),
    },
    ...story.pages.map((page) => ({
      id: `page-${page.pageNumber}`,
      href: `page-${page.pageNumber}.xhtml`,
      title: `${title} - Page ${page.pageNumber}`,
      content: renderPageXhtml({
        title,
        heading: title,
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
