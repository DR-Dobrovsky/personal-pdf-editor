import { PDFDocument } from "pdf-lib";
import { exportPdfForVisibleRendering } from "@/lib/export-pdf";
import type { EditorElement, EditorPage } from "@/types/editor";

const TARGET_SCALE = 2;
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_CANVAS_DIMENSION = 8_192;

const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error("The flattened page image could not be created."));
  }, "image/png");
});

const boundedRenderScale = (width: number, height: number) => {
  const pixelScale = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, width * height));
  const dimensionScale = MAX_CANVAS_DIMENSION / Math.max(1, width, height);
  const scale = Math.min(TARGET_SCALE, pixelScale, dimensionScale);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("This page is too large to render safely in the browser.");
  }
  return scale;
};

/**
 * Creates a new image-only PDF from the final edited appearance. The source
 * PDF is used only to compose an in-memory intermediate and is never copied
 * into the returned document, so hidden text, layers, annotations, forms,
 * attachments, actions, and original metadata are not retained.
 */
export async function exportVisibleOnlyPdf(
  sourceBytes: Uint8Array,
  pages: EditorPage[],
  elements: EditorElement[],
  onPage?: (pageNumber: number, pageCount: number) => void,
) {
  const composedBytes = await exportPdfForVisibleRendering(sourceBytes, pages, elements);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const loadingTask = pdfjs.getDocument({ data: composedBytes });
  try {
    const composedDocument = await loadingTask.promise;
    const output = await PDFDocument.create();
    output.setCreator("Paperly private PDF editor");
    output.setProducer("Paperly visible-only export");
    output.setSubject("Flattened image-only PDF");

    for (let pageNumber = 1; pageNumber <= composedDocument.numPages; pageNumber += 1) {
      onPage?.(pageNumber, composedDocument.numPages);
      const sourcePage = await composedDocument.getPage(pageNumber);
      const pageSize = sourcePage.getViewport({ scale: 1 });
      const renderScale = boundedRenderScale(pageSize.width, pageSize.height);
      const viewport = sourcePage.getViewport({ scale: renderScale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      if (
        canvas.width > MAX_CANVAS_DIMENSION
        || canvas.height > MAX_CANVAS_DIMENSION
        || canvas.width * canvas.height > MAX_CANVAS_PIXELS
      ) {
        throw new Error(`Page ${pageNumber} is too large to render safely in the browser.`);
      }
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("The browser could not create a PDF rendering canvas.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await sourcePage.render({
        canvas,
        canvasContext: context,
        viewport,
        background: "#ffffff",
      }).promise;

      const png = await output.embedPng(await (await canvasBlob(canvas)).arrayBuffer());
      const outputPage = output.addPage([pageSize.width, pageSize.height]);
      outputPage.drawImage(png, {
        x: 0,
        y: 0,
        width: pageSize.width,
        height: pageSize.height,
      });
      // Force each PNG into the PDF context now so its decoded RGB channels
      // can be garbage-collected before the next page is rendered.
      await png.embed();

      sourcePage.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }

    return output.save();
  } finally {
    await loadingTask.destroy();
  }
}
