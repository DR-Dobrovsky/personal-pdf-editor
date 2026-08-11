import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import type {
  DrawingElement,
  EditorElement,
  EditorPage,
  Point,
  TextElement,
} from "@/types/editor";

const hexToRgb = (hex: string) => {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized,
    16,
  );
  return rgb(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  );
};

const normalizeRotation = (rotation: number) =>
  ((rotation % 360) + 360) % 360;

const displayPointToPdf = (
  point: Point,
  width: number,
  height: number,
  rotation: number,
): Point => {
  switch (normalizeRotation(rotation)) {
    case 90:
      return { x: point.y, y: point.x };
    case 180:
      return { x: width - point.x, y: point.y };
    case 270:
      return { x: width - point.y, y: height - point.x };
    default:
      return { x: point.x, y: height - point.y };
  }
};

const elementBoundsInPdf = (
  element: EditorElement,
  page: EditorPage,
) => {
  const rotation = page.originalRotation + page.rotation;
  const corners = [
    { x: element.x, y: element.y },
    { x: element.x + element.width, y: element.y },
    { x: element.x, y: element.y + element.height },
    { x: element.x + element.width, y: element.y + element.height },
  ].map((point) =>
    displayPointToPdf(point, page.width, page.height, rotation),
  );
  const xs = corners.map(({ x }) => x);
  const ys = corners.map(({ y }) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
};

const wrapText = (
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
) => {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
};

const drawTextElement = async (
  document: PDFDocument,
  outputPage: PDFPage,
  page: EditorPage,
  element: TextElement,
) => {
  const fontNames = {
    Helvetica: element.bold
      ? StandardFonts.HelveticaBold
      : StandardFonts.Helvetica,
    "Times Roman": element.bold
      ? StandardFonts.TimesRomanBold
      : StandardFonts.TimesRoman,
    Courier: element.bold
      ? StandardFonts.CourierBold
      : StandardFonts.Courier,
  } as const;
  const font = await document.embedFont(fontNames[element.fontFamily]);
  const bounds = elementBoundsInPdf(element, page);
  const lines = wrapText(element.text, font, element.fontSize, bounds.width);
  const lineHeight = element.fontSize * 1.22;

  lines.slice(0, Math.max(1, Math.floor(bounds.height / lineHeight))).forEach(
    (line, index) => {
      const textWidth = font.widthOfTextAtSize(line, element.fontSize);
      const offset =
        element.align === "center"
          ? (bounds.width - textWidth) / 2
          : element.align === "right"
            ? bounds.width - textWidth
            : 0;
      outputPage.drawText(line, {
        x: bounds.x + Math.max(0, offset),
        y: bounds.y + bounds.height - element.fontSize - index * lineHeight,
        size: element.fontSize,
        font,
        color: hexToRgb(element.color),
        opacity: element.opacity,
      });
    },
  );
};

const dataUrlBytes = (src: string) => {
  const base64 = src.split(",")[1];
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const drawImageElement = async (
  document: PDFDocument,
  outputPage: PDFPage,
  page: EditorPage,
  element: Extract<EditorElement, { type: "image" | "signature" }>,
) => {
  const bytes = dataUrlBytes(element.src);
  const image = element.src.startsWith("data:image/jpeg")
    ? await document.embedJpg(bytes)
    : await document.embedPng(bytes);
  const bounds = elementBoundsInPdf(element, page);
  outputPage.drawImage(image, {
    ...bounds,
    opacity: element.opacity,
  });
};

const drawPath = (
  outputPage: PDFPage,
  page: EditorPage,
  element: DrawingElement,
) => {
  const rotation = page.originalRotation + page.rotation;
  for (let index = 1; index < element.points.length; index += 1) {
    const from = element.points[index - 1];
    const to = element.points[index];
    outputPage.drawLine({
      start: displayPointToPdf(
        { x: element.x + from.x, y: element.y + from.y },
        page.width,
        page.height,
        rotation,
      ),
      end: displayPointToPdf(
        { x: element.x + to.x, y: element.y + to.y },
        page.width,
        page.height,
        rotation,
      ),
      thickness: element.strokeWidth,
      color: hexToRgb(element.color),
      opacity: element.opacity,
    });
  }
};

export async function exportPdf(
  sourceBytes: Uint8Array,
  pages: EditorPage[],
  elements: EditorElement[],
) {
  const source = await PDFDocument.load(sourceBytes, {
    updateMetadata: false,
  });
  const output = await PDFDocument.create();
  output.setCreator("Paperly private PDF editor");
  output.setProducer("Paperly");

  for (const editorPage of pages) {
    const [copiedPage] = await output.copyPages(source, [editorPage.sourceIndex]);
    output.addPage(copiedPage);
    copiedPage.setRotation(
      degrees(
        normalizeRotation(editorPage.originalRotation + editorPage.rotation),
      ),
    );

    for (const element of elements.filter(
      ({ pageId }) => pageId === editorPage.id,
    )) {
      if (element.type === "text") {
        await drawTextElement(output, copiedPage, editorPage, element);
      } else if (element.type === "image" || element.type === "signature") {
        await drawImageElement(output, copiedPage, editorPage, element);
      } else if (element.type === "draw") {
        drawPath(copiedPage, editorPage, element);
      } else {
        const bounds = elementBoundsInPdf(element, editorPage);
        copiedPage.drawRectangle({
          ...bounds,
          color: hexToRgb(element.color),
          opacity: element.opacity,
        });
      }
    }
  }

  return output.save();
}
