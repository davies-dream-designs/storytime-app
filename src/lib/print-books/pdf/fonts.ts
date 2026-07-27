import { readFile } from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";

let liberationSerifBytes: Uint8Array | null = null;
let liberationSerifBoldBytes: Uint8Array | null = null;
let liberationSansBytes: Uint8Array | null = null;
let liberationSansBoldBytes: Uint8Array | null = null;

export type EmbeddedPdfFonts = {
  serif: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  serifBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sans: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sansBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
};

async function getFontBytes(
  fileName: string,
  cache: Uint8Array | null
): Promise<Uint8Array> {
  if (cache) return cache;
  const bytes = await readFile(
    path.join(process.cwd(), "public/fonts/liberation", fileName)
  );
  return Uint8Array.from(bytes);
}

export async function loadEmbeddedPdfFonts(
  pdfDoc: PDFDocument
): Promise<EmbeddedPdfFonts> {
  pdfDoc.registerFontkit(fontkit);

  liberationSerifBytes = await getFontBytes(
    "LiberationSerif-Regular.ttf",
    liberationSerifBytes
  );
  liberationSerifBoldBytes = await getFontBytes(
    "LiberationSerif-Bold.ttf",
    liberationSerifBoldBytes
  );
  liberationSansBytes = await getFontBytes(
    "LiberationSans-Regular.ttf",
    liberationSansBytes
  );
  liberationSansBoldBytes = await getFontBytes(
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
