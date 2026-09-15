import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";

let liberationSerifBytes: Uint8Array | null = null;
let liberationSerifBoldBytes: Uint8Array | null = null;
let liberationSansBytes: Uint8Array | null = null;
let liberationSansBoldBytes: Uint8Array | null = null;
let notoCjkBytes: Uint8Array | null = null;

export type EmbeddedPdfFonts = {
  serif: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  serifBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sans: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sansBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
};

// Locales whose scripts are not covered by the Latin/Cyrillic Liberation fonts
// and need the embedded Noto Sans CJK font instead (otherwise the glyphs render
// as .notdef "tofu" boxes and pdf-lib throws on encode).
const CJK_LOCALES = new Set(["zh", "ja", "ko"]);

export function localeNeedsCjkFont(locale: string | undefined): boolean {
  return CJK_LOCALES.has((locale ?? "").split("-")[0]!);
}

async function getFontBytes(
  dir: string,
  fileName: string,
  cache: Uint8Array | null
): Promise<Uint8Array> {
  if (cache) return cache;
  const bytes = await readFile(
    path.join(process.cwd(), "public/fonts", dir, fileName)
  );
  return Uint8Array.from(bytes);
}

export async function loadEmbeddedPdfFonts(
  pdfDoc: PDFDocument,
  locale?: string
): Promise<EmbeddedPdfFonts> {
  pdfDoc.registerFontkit(fontkit);

  // Noto Sans CJK covers Chinese, Japanese, Korean, Cyrillic and Latin, so for
  // CJK locales it becomes the single family for every weight. pdf-lib subsets
  // on embed, so only the glyphs actually used are written into the PDF (a
  // full-page CJK story adds tens of KB, not the 16 MB source font).
  if (localeNeedsCjkFont(locale)) {
    notoCjkBytes = await getFontBytes(
      "noto",
      "NotoSansCJK-Regular.otf",
      notoCjkBytes
    );
    const cjk = await pdfDoc.embedFont(notoCjkBytes, { subset: true });
    return { serif: cjk, serifBold: cjk, sans: cjk, sansBold: cjk };
  }

  liberationSerifBytes = await getFontBytes(
    "liberation",
    "LiberationSerif-Regular.ttf",
    liberationSerifBytes
  );
  liberationSerifBoldBytes = await getFontBytes(
    "liberation",
    "LiberationSerif-Bold.ttf",
    liberationSerifBoldBytes
  );
  liberationSansBytes = await getFontBytes(
    "liberation",
    "LiberationSans-Regular.ttf",
    liberationSansBytes
  );
  liberationSansBoldBytes = await getFontBytes(
    "liberation",
    "LiberationSans-Bold.ttf",
    liberationSansBoldBytes
  );

  return {
    serif: await pdfDoc.embedFont(liberationSerifBytes),
    serifBold: await pdfDoc.embedFont(liberationSerifBoldBytes),
    sans: await pdfDoc.embedFont(liberationSansBytes),
    sansBold: await pdfDoc.embedFont(liberationSansBoldBytes),
  };
}
