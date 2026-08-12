import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObjectCopier,
  type PDFObject,
  type PDFRef,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import {
  basePageDisplaySize,
  contentOffsetAtSourceY,
  orderedSpaces,
  outputPageSize,
} from "@/lib/editor-utils";
import type {
  DrawingElement,
  EditorElement,
  EditorPage,
  LineElement,
  Point,
  SourceLinkAnnotation,
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

const pdfPointToDisplay = (
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
      return { x: height - point.y, y: width - point.x };
    default:
      return { x: point.x, y: height - point.y };
  }
};

const elementBoundsInPdf = (
  element: EditorElement,
  page: EditorPage,
) => {
  const rotation = page.originalRotation + page.rotation;
  const outputSize = outputPageSize(page);
  const corners = [
    { x: element.x, y: element.y },
    { x: element.x + element.width, y: element.y },
    { x: element.x, y: element.y + element.height },
    { x: element.x + element.width, y: element.y + element.height },
  ].map((point) =>
    displayPointToPdf(point, outputSize.width, outputSize.height, rotation),
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
  const outputSize = outputPageSize(page);
  for (let index = 1; index < element.points.length; index += 1) {
    const from = element.points[index - 1];
    const to = element.points[index];
    outputPage.drawLine({
      start: displayPointToPdf(
        { x: element.x + from.x, y: element.y + from.y },
        outputSize.width,
        outputSize.height,
        rotation,
      ),
      end: displayPointToPdf(
        { x: element.x + to.x, y: element.y + to.y },
        outputSize.width,
        outputSize.height,
        rotation,
      ),
      thickness: element.strokeWidth,
      color: hexToRgb(element.color),
      opacity: element.opacity,
    });
  }
};

const drawStraightLine = (
  outputPage: PDFPage,
  page: EditorPage,
  element: LineElement,
) => {
  const rotation = page.originalRotation + page.rotation;
  const outputSize = outputPageSize(page);
  const endpoint = (point: Point) => displayPointToPdf(
    {
      x: element.x + point.x * element.width,
      y: element.y + point.y * element.height,
    },
    outputSize.width,
    outputSize.height,
    rotation,
  );
  outputPage.drawLine({
    start: endpoint(element.start),
    end: endpoint(element.end),
    thickness: element.strokeWidth,
    color: hexToRgb(element.color),
    opacity: element.opacity,
  });
};

const visualRectangleBoundsInPdf = (
  x: number,
  y: number,
  width: number,
  height: number,
  pdfWidth: number,
  pdfHeight: number,
  rotation: number,
) => {
  const corners = [
    { x, y },
    { x: x + width, y },
    { x, y: y + height },
    { x: x + width, y: y + height },
  ].map((point) => displayPointToPdf(point, pdfWidth, pdfHeight, rotation));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const bottom = Math.min(...ys);
  return {
    left,
    bottom,
    right: Math.max(...xs),
    top: Math.max(...ys),
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - bottom,
  };
};

const pdfArrayNumbers = (array: PDFArray) => {
  const values: number[] = [];
  for (let index = 0; index < array.size(); index += 1) {
    const value = array.lookupMaybe(index, PDFNumber);
    if (!value) return undefined;
    values.push(value.asNumber());
  }
  return values;
};

const annotationPointToOutput = (
  point: Point,
  editorPage: EditorPage,
  sourceBox: { x: number; y: number },
) => {
  const rotation = editorPage.originalRotation + editorPage.rotation;
  const visual = pdfPointToDisplay(
    { x: point.x - sourceBox.x, y: point.y - sourceBox.y },
    editorPage.width,
    editorPage.height,
    rotation,
  );
  visual.y += contentOffsetAtSourceY(editorPage, visual.y);
  const outputSize = outputPageSize(editorPage);
  return displayPointToPdf(
    visual,
    outputSize.width,
    outputSize.height,
    rotation,
  );
};

const transformedPointArray = (
  array: PDFArray,
  output: PDFDocument,
  editorPage: EditorPage,
  sourceBox: { x: number; y: number },
) => {
  const values = pdfArrayNumbers(array);
  if (!values || values.length % 2 !== 0) return undefined;
  const transformed: number[] = [];
  for (let index = 0; index < values.length; index += 2) {
    const point = annotationPointToOutput(
      { x: values[index], y: values[index + 1] },
      editorPage,
      sourceBox,
    );
    transformed.push(point.x, point.y);
  }
  return output.context.obj(transformed);
};

const transformedRect = (
  array: PDFArray,
  output: PDFDocument,
  editorPage: EditorPage,
  sourceBox: { x: number; y: number },
) => {
  const values = pdfArrayNumbers(array);
  if (!values || values.length !== 4) return undefined;
  const left = Math.min(values[0], values[2]);
  const right = Math.max(values[0], values[2]);
  const bottom = Math.min(values[1], values[3]);
  const top = Math.max(values[1], values[3]);
  const points = [
    { x: left, y: bottom },
    { x: left, y: top },
    { x: right, y: bottom },
    { x: right, y: top },
  ].map((point) => annotationPointToOutput(point, editorPage, sourceBox));
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  return output.context.obj([
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ]);
};

type ExportedPageRecord = {
  editorPage: EditorPage;
  sourcePage: PDFPage;
  outputPage: PDFPage;
};

const internalDestination = (
  output: PDFDocument,
  link: SourceLinkAnnotation,
  target: ExportedPageRecord,
) => {
  const mode = link.destination?.mode ?? "Fit";
  const parameters = [...(link.destination?.parameters ?? [])];
  const sourceBox = target.sourcePage.getCropBox();
  const transformPoint = (x: number, y: number) => annotationPointToOutput(
    { x, y },
    target.editorPage,
    sourceBox,
  );

  if (mode === "XYZ") {
    const left = parameters[0];
    const top = parameters[1];
    if (typeof left === "number" || typeof top === "number") {
      const point = transformPoint(
        typeof left === "number" ? left : sourceBox.x,
        typeof top === "number" ? top : sourceBox.y + target.editorPage.height,
      );
      if (typeof left === "number") parameters[0] = point.x;
      if (typeof top === "number") parameters[1] = point.y;
    }
  } else if (mode === "FitH" || mode === "FitBH") {
    const top = parameters[0];
    if (typeof top === "number") {
      parameters[0] = transformPoint(sourceBox.x, top).y;
    }
  } else if (mode === "FitV" || mode === "FitBV") {
    const left = parameters[0];
    if (typeof left === "number") {
      parameters[0] = transformPoint(left, sourceBox.y).x;
    }
  } else if (mode === "FitR" && parameters.slice(0, 4).every((value) => typeof value === "number")) {
    const [left, bottom, right, top] = parameters as [number, number, number, number];
    const points = [
      transformPoint(left, bottom),
      transformPoint(left, top),
      transformPoint(right, bottom),
      transformPoint(right, top),
    ];
    const xs = points.map(({ x }) => x);
    const ys = points.map(({ y }) => y);
    parameters.splice(
      0,
      4,
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    );
  }

  return output.context.obj([
    target.outputPage.ref,
    PDFName.of(mode),
    ...parameters,
  ]);
};

const rewriteCopiedPageInternalLinks = (
  output: PDFDocument,
  outputPage: PDFPage,
  editorPage: EditorPage,
  outputPagesBySourceIndex: Map<number, ExportedPageRecord[]>,
) => {
  if (!editorPage.links.some(({ internal }) => internal)) return;
  const annotations = outputPage.node.Annots();
  if (!annotations) return;
  let linkIndex = 0;

  for (let index = 0; index < annotations.size(); index += 1) {
    const annotation = annotations.lookupMaybe(index, PDFDict);
    const subtype = annotation
      ?.lookupMaybe(PDFName.of("Subtype"), PDFName)
      ?.asString();
    if (!annotation || subtype !== "/Link") continue;
    const link = editorPage.links[linkIndex++];
    if (!link?.internal) continue;

    annotation.delete(PDFName.of("A"));
    annotation.delete(PDFName.of("Dest"));
    const target = link.targetSourceIndex === undefined
      ? undefined
      : outputPagesBySourceIndex.get(link.targetSourceIndex)?.[0];
    if (target) {
      annotation.set(
        PDFName.of("Dest"),
        internalDestination(output, link, target),
      );
    }
  }
};

const copyAnnotationsForSpacedPage = (
  output: PDFDocument,
  copier: PDFObjectCopier,
  sourcePage: PDFPage,
  outputPage: PDFPage,
  editorPage: EditorPage,
  outputPagesBySourceIndex: Map<number, ExportedPageRecord[]>,
) => {
  const annotations = sourcePage.node.Annots();
  if (!annotations) return;
  const sourceBox = sourcePage.getCropBox();
  let linkIndex = 0;
  const relationKeys = ["Popup", "Parent", "IRT"];
  const outputRefs = new Map<PDFObject, PDFRef>();
  const copiedAnnotations: Array<{
    source: PDFDict;
    copied: PDFDict;
  }> = [];

  for (let index = 0; index < annotations.size(); index += 1) {
    const sourceEntry = annotations.get(index);
    const sourceAnnotation = annotations.lookupMaybe(index, PDFDict);
    if (!sourceAnnotation) continue;
    const subtype = sourceAnnotation.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString();
    if (subtype === "/Widget") continue;

    const link = subtype === "/Link" ? editorPage.links[linkIndex++] : undefined;
    const detached = sourceAnnotation.clone(sourceAnnotation.context);
    detached.delete(PDFName.of("P"));
    for (const key of relationKeys) detached.delete(PDFName.of(key));
    if (link?.internal) {
      detached.delete(PDFName.of("A"));
      detached.delete(PDFName.of("Dest"));
    }
    const copied = copier.copy(detached);
    copied.set(PDFName.of("P"), outputPage.ref);

    const rect = sourceAnnotation.lookupMaybe(PDFName.of("Rect"), PDFArray);
    const nextRect = rect
      ? transformedRect(rect, output, editorPage, sourceBox)
      : undefined;
    if (nextRect) copied.set(PDFName.of("Rect"), nextRect);

    for (const key of ["QuadPoints", "Vertices", "L", "CL"]) {
      const points = sourceAnnotation.lookupMaybe(PDFName.of(key), PDFArray);
      const nextPoints = points
        ? transformedPointArray(points, output, editorPage, sourceBox)
        : undefined;
      if (nextPoints) copied.set(PDFName.of(key), nextPoints);
    }

    const inkList = sourceAnnotation.lookupMaybe(PDFName.of("InkList"), PDFArray);
    if (inkList) {
      const nextInkList = output.context.obj([]);
      for (let strokeIndex = 0; strokeIndex < inkList.size(); strokeIndex += 1) {
        const stroke = inkList.lookupMaybe(strokeIndex, PDFArray);
        const nextStroke = stroke
          ? transformedPointArray(stroke, output, editorPage, sourceBox)
          : undefined;
        if (nextStroke) nextInkList.push(nextStroke);
      }
      copied.set(PDFName.of("InkList"), nextInkList);
    }

    if (link?.internal) {
      const target = link.targetSourceIndex === undefined
        ? undefined
        : outputPagesBySourceIndex.get(link.targetSourceIndex)?.[0];
      if (target) {
        copied.set(
          PDFName.of("Dest"),
          internalDestination(output, link, target),
        );
      }
    }

    const outputRef = output.context.register(copied);
    outputRefs.set(sourceEntry, outputRef);
    outputRefs.set(sourceAnnotation, outputRef);
    copiedAnnotations.push({ source: sourceAnnotation, copied });
    outputPage.node.addAnnot(outputRef);
  }

  for (const { source: sourceAnnotation, copied } of copiedAnnotations) {
    for (const key of relationKeys) {
      const sourceRelation = sourceAnnotation.get(PDFName.of(key));
      if (!sourceRelation) continue;
      const relationObject = sourceAnnotation.context.lookup(sourceRelation);
      const outputRef = outputRefs.get(sourceRelation)
        ?? (relationObject ? outputRefs.get(relationObject) : undefined);
      if (outputRef) copied.set(PDFName.of(key), outputRef);
    }
  }
};

const drawPageWithSpaces = async (
  output: PDFDocument,
  sourcePage: PDFPage,
  editorPage: EditorPage,
) => {
  const rotation = normalizeRotation(
    editorPage.originalRotation + editorPage.rotation,
  );
  const baseSize = basePageDisplaySize(editorPage);
  const outputSize = outputPageSize(editorPage);
  const outputPage = output.addPage([outputSize.width, outputSize.height]);
  outputPage.setRotation(degrees(rotation));
  if (!sourcePage.node.Contents()) return outputPage;
  const sourceBox = sourcePage.getCropBox();
  let sourceStart = 0;
  let offset = 0;

  const drawSlice = async (sourceEnd: number) => {
    const stripHeight = Math.max(0, sourceEnd - sourceStart);
    if (stripHeight <= 0.001) {
      sourceStart = sourceEnd;
      return;
    }

    const sourceBounds = visualRectangleBoundsInPdf(
      0,
      sourceStart,
      baseSize.width,
      stripHeight,
      editorPage.width,
      editorPage.height,
      rotation,
    );
    const destinationBounds = visualRectangleBoundsInPdf(
      0,
      sourceStart + offset,
      baseSize.width,
      stripHeight,
      outputSize.width,
      outputSize.height,
      rotation,
    );

    try {
      const embedded = await output.embedPage(sourcePage, {
        left: sourceBox.x + sourceBounds.left,
        bottom: sourceBox.y + sourceBounds.bottom,
        right: sourceBox.x + sourceBounds.right,
        top: sourceBox.y + sourceBounds.top,
      });
      outputPage.drawPage(embedded, {
        x: destinationBounds.left,
        y: destinationBounds.bottom,
        width: destinationBounds.width,
        height: destinationBounds.height,
      });
    } catch (error) {
      if (!(error instanceof Error && error.name === "MissingPageContentsEmbeddingError")) {
        throw error;
      }
    }
    sourceStart = sourceEnd;
  };

  for (const space of orderedSpaces(editorPage)) {
    await drawSlice(Math.min(baseSize.height, Math.max(sourceStart, space.sourceY)));
    offset += space.height;
  }
  await drawSlice(baseSize.height);
  return outputPage;
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
  const annotationCopier = PDFObjectCopier.for(source.context, output.context);
  const exportedPages: ExportedPageRecord[] = [];
  const outputPagesBySourceIndex = new Map<number, ExportedPageRecord[]>();

  for (const editorPage of pages) {
    const sourcePage = source.getPage(editorPage.sourceIndex);
    let outputPage: PDFPage;
    if (editorPage.spaces.length > 0) {
      if (editorPage.hasFormFields) {
        throw new Error("Cannot insert Space on a page with interactive form fields.");
      }
      outputPage = await drawPageWithSpaces(output, sourcePage, editorPage);
    } else {
      const [copiedPage] = await output.copyPages(source, [editorPage.sourceIndex]);
      output.addPage(copiedPage);
      copiedPage.setRotation(
        degrees(
          normalizeRotation(editorPage.originalRotation + editorPage.rotation),
        ),
      );
      outputPage = copiedPage;
    }

    const record = { editorPage, sourcePage, outputPage };
    exportedPages.push(record);
    const matchingPages = outputPagesBySourceIndex.get(editorPage.sourceIndex) ?? [];
    matchingPages.push(record);
    outputPagesBySourceIndex.set(editorPage.sourceIndex, matchingPages);
  }

  for (const { editorPage, sourcePage, outputPage } of exportedPages) {
    if (editorPage.spaces.length > 0) {
      copyAnnotationsForSpacedPage(
        output,
        annotationCopier,
        sourcePage,
        outputPage,
        editorPage,
        outputPagesBySourceIndex,
      );
    } else {
      rewriteCopiedPageInternalLinks(
        output,
        outputPage,
        editorPage,
        outputPagesBySourceIndex,
      );
    }

    for (const element of elements.filter(
      ({ pageId }) => pageId === editorPage.id,
    )) {
      if (element.type === "text") {
        await drawTextElement(output, outputPage, editorPage, element);
      } else if (element.type === "image" || element.type === "signature") {
        await drawImageElement(output, outputPage, editorPage, element);
      } else if (element.type === "draw") {
        drawPath(outputPage, editorPage, element);
      } else if (element.type === "line") {
        drawStraightLine(outputPage, editorPage, element);
      } else {
        const bounds = elementBoundsInPdf(element, editorPage);
        outputPage.drawRectangle({
          ...bounds,
          color: hexToRgb(element.color),
          opacity: element.opacity,
        });
      }
    }
  }

  return output.save();
}
