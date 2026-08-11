"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { FileText, LockKeyhole, Plus, X } from "lucide-react";
import EditorToolbar from "./editor-toolbar";
import PagesSidebar from "./pages-sidebar";
import PdfPage from "./pdf-page";
import PropertyInspector from "./property-inspector";
import SignatureDialog from "./signature-dialog";
import UploadScreen from "./upload-screen";
import { cloneSnapshot, displaySize, uid } from "@/lib/editor-utils";
import { exportPdf } from "@/lib/export-pdf";
import type {
  EditorElement,
  EditorPage,
  EditorSnapshot,
  EditorTool,
  Point,
} from "@/types/editor";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export default function PdfEditor() {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState("");
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [activePageId, setActivePageId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("select");
  const [zoom, setZoom] = useState(1);
  const [past, setPast] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const pagesRef = useRef(pages);
  const elementsRef = useRef(elements);

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => () => { void loadingTaskRef.current?.destroy(); }, []);

  const snapshot = useCallback(
    () => cloneSnapshot({ pages: pagesRef.current, elements: elementsRef.current }),
    [],
  );

  const pushHistory = useCallback(() => {
    const current = snapshot();
    setPast((items) => [...items.slice(-49), current]);
    setFuture([]);
  }, [snapshot]);

  const restore = useCallback((value: EditorSnapshot) => {
    setPages(value.pages);
    setElements(value.elements);
    setSelectedId(null);
    if (!value.pages.some(({ id }) => id === activePageId)) {
      setActivePageId(value.pages[0]?.id ?? "");
    }
  }, [activePageId]);

  const undo = useCallback(() => {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((items) => [snapshot(), ...items].slice(0, 50));
    setPast((items) => items.slice(0, -1));
    restore(previous);
  }, [past, restore, snapshot]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setPast((items) => [...items, snapshot()].slice(-50));
    setFuture((items) => items.slice(1));
    restore(next);
  }, [future, restore, snapshot]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (!editingField && (event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        pushHistory();
        setElements((items) => items.filter(({ id }) => id !== selectedId));
        setSelectedId(null);
      } else if (event.key === "Escape") {
        setSelectedId(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [pushHistory, redo, selectedId, undo]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (pdfDocument && past.length > 0) event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [past.length, pdfDocument]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadFile = async (file: File) => {
    setError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("This file is larger than 100 MB. Try a smaller PDF for now.");
      return;
    }

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const task = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) });
      task.onPassword = (
        updatePassword: (password: string) => void,
        reason: number,
      ) => {
        const password = window.prompt(
          reason === 1
            ? "This PDF is password-protected. Enter its password:"
            : "That password did not work. Please try again:",
        );
        updatePassword(password ?? "");
      };
      const document = await task.promise;
      const loadedPages = await Promise.all(
        Array.from({ length: document.numPages }, async (_, sourceIndex) => {
          const pdfPage = await document.getPage(sourceIndex + 1);
          const viewport = pdfPage.getViewport({ scale: 1, rotation: 0 });
          return {
            id: uid("page"),
            sourceIndex,
            width: viewport.width,
            height: viewport.height,
            originalRotation: pdfPage.rotate,
            rotation: 0,
          } satisfies EditorPage;
        }),
      );

      await loadingTaskRef.current?.destroy();
      loadingTaskRef.current = task;
      setPdfDocument(document);
      setSourceBytes(new Uint8Array(buffer));
      setFileName(file.name);
      setPages(loadedPages);
      setElements([]);
      setPast([]);
      setFuture([]);
      setSelectedId(null);
      setActivePageId(loadedPages[0]?.id ?? "");
      setTool("select");
      setZoom(1);
      setNotice(`${document.numPages} ${document.numPages === 1 ? "page" : "pages"} ready to edit`);
    } catch (caught) {
      console.error(caught);
      setError("I couldn’t open this PDF. It may be damaged, encrypted, or use an unsupported format.");
    } finally {
      setLoading(false);
    }
  };

  const addElement = (element: EditorElement) => {
    pushHistory();
    setElements((items) => [...items, element]);
    setSelectedId(element.id);
    setTool("select");
  };

  const placeElement = (page: EditorPage, point: Point) => {
    const totalRotation = page.originalRotation + page.rotation;
    const size = displaySize(page.width, page.height, totalRotation);
    if (tool === "text") {
      addElement({
        id: uid("text"), pageId: page.id, type: "text",
        x: Math.min(point.x, size.width - 190), y: Math.min(point.y, size.height - 52),
        width: 190, height: 52, opacity: 1, text: "Type something…",
        fontSize: 18, fontFamily: "Helvetica", color: "#17211b", bold: false, align: "left",
      });
    } else if (tool === "highlight") {
      addElement({
        id: uid("highlight"), pageId: page.id, type: "highlight",
        x: Math.min(point.x, size.width - 160), y: Math.min(point.y, size.height - 32),
        width: 160, height: 32, opacity: 0.38, color: "#f4d35e",
      });
    } else if (tool === "redact") {
      addElement({
        id: uid("redact"), pageId: page.id, type: "redact",
        x: Math.min(point.x, size.width - 160), y: Math.min(point.y, size.height - 32),
        width: 160, height: 32, opacity: 1, color: "#17211b",
      });
    }
  };

  const addImageSource = (src: string, kind: "image" | "signature", naturalRatio = 3) => {
    const page = pagesRef.current.find(({ id }) => id === activePageId) ?? pagesRef.current[0];
    if (!page) return;
    const size = displaySize(page.width, page.height, page.originalRotation + page.rotation);
    const width = kind === "signature" ? 220 : Math.min(220, size.width * 0.45);
    const height = kind === "signature" ? 74 : Math.min(width / naturalRatio, size.height * 0.4);
    addElement({
      id: uid(kind), pageId: page.id, type: kind, src,
      x: Math.max(0, (size.width - width) / 2), y: Math.max(0, (size.height - height) / 2),
      width, height, opacity: 1,
    });
  };

  const addImageFile = (file: File) => {
    if (!file.type.match(/^image\/(png|jpeg)$/)) {
      setNotice("Please choose a PNG or JPEG image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const image = new Image();
      image.onload = () => addImageSource(src, "image", image.width / image.height);
      image.onerror = () => setNotice("That image could not be opened.");
      image.src = src;
    };
    reader.readAsDataURL(file);
  };

  const updateElement = (id: string, patch: Partial<EditorElement>) => {
    setElements((items) => items.map((element) =>
      element.id === id ? ({ ...element, ...patch } as EditorElement) : element,
    ));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    setElements((items) => items.filter(({ id }) => id !== selectedId));
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    const original = elementsRef.current.find(({ id }) => id === selectedId);
    if (!original) return;
    const duplicate = { ...structuredClone(original), id: uid(original.type), x: original.x + 14, y: original.y + 14 } as EditorElement;
    addElement(duplicate);
  };

  const movePage = (pageId: string, direction: -1 | 1) => {
    const index = pagesRef.current.findIndex(({ id }) => id === pageId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= pagesRef.current.length) return;
    pushHistory();
    setPages((items) => {
      const copy = [...items];
      [copy[index], copy[destination]] = [copy[destination], copy[index]];
      return copy;
    });
  };

  const rotatePage = (pageId: string) => {
    const page = pagesRef.current.find(({ id }) => id === pageId);
    if (!page) return;
    const oldSize = displaySize(page.width, page.height, page.originalRotation + page.rotation);
    pushHistory();
    setPages((items) => items.map((item) => item.id === pageId ? { ...item, rotation: (item.rotation + 90) % 360 } : item));
    setElements((items) => items.map((element) => element.pageId === pageId ? ({
      ...element,
      x: Math.max(0, oldSize.height - element.y - element.height),
      y: element.x,
      width: element.height,
      height: element.width,
    } as EditorElement) : element));
  };

  const duplicatePage = (pageId: string) => {
    const index = pagesRef.current.findIndex(({ id }) => id === pageId);
    if (index < 0) return;
    const copyId = uid("page");
    const copy = { ...pagesRef.current[index], id: copyId };
    const copiedElements = elementsRef.current
      .filter((element) => element.pageId === pageId)
      .map((element) => ({ ...structuredClone(element), id: uid(element.type), pageId: copyId } as EditorElement));
    pushHistory();
    setPages((items) => [...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
    setElements((items) => [...items, ...copiedElements]);
    setActivePageId(copyId);
  };

  const deletePage = (pageId: string) => {
    if (pagesRef.current.length <= 1) return;
    const index = pagesRef.current.findIndex(({ id }) => id === pageId);
    pushHistory();
    setPages((items) => items.filter(({ id }) => id !== pageId));
    setElements((items) => items.filter((element) => element.pageId !== pageId));
    setSelectedId(null);
    if (activePageId === pageId) {
      setActivePageId(pagesRef.current[index + 1]?.id ?? pagesRef.current[index - 1]?.id ?? "");
    }
  };

  const downloadPdf = async () => {
    if (!sourceBytes || !pages.length) return;
    setExporting(true);
    setNotice(null);
    try {
      const bytes = await exportPdf(sourceBytes, pages, elements);
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${fileName.replace(/\.pdf$/i, "") || "document"}-edited.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Your edited PDF has been downloaded");
    } catch (caught) {
      console.error(caught);
      setNotice("Export failed. This PDF may have restrictions that prevent editing.");
    } finally {
      setExporting(false);
    }
  };

  const startNewDocument = () => {
    if (past.length > 0 && !window.confirm("Open another PDF? Unsaved edits in this document will be cleared.")) return;
    replaceInputRef.current?.click();
  };

  if (!pdfDocument) {
    return <UploadScreen busy={loading} error={error} onFile={loadFile} />;
  }

  const selectedElement = elements.find(({ id }) => id === selectedId);

  return (
    <main className="app-shell editor-shell">
      <header className="editor-header">
        <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
          <span className="brand-mark"><FileText size={18} /></span><span>Paperly</span>
        </a>
        <div className="document-name">
          <FileText size={16} /><span title={fileName}>{fileName}</span>
          <span className="saved-dot">Local</span>
        </div>
        <div className="header-actions">
          <span className="private-label"><LockKeyhole size={14} /> Private session</span>
          <button className="secondary-button new-document" onClick={startNewDocument}><Plus size={16} /> New PDF</button>
          <input ref={replaceInputRef} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile(file); event.target.value = ""; }} />
        </div>
      </header>

      <EditorToolbar
        tool={tool}
        zoom={zoom}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        exporting={exporting}
        onTool={(next) => { setTool(next); setSelectedId(null); }}
        onUndo={undo}
        onRedo={redo}
        onZoom={setZoom}
        onImage={addImageFile}
        onSignature={() => setSignatureOpen(true)}
        onExport={() => void downloadPdf()}
      />

      <div className="editor-workspace">
        <PagesSidebar
          document={pdfDocument}
          pages={pages}
          activePageId={activePageId}
          onSelect={(id) => { setActivePageId(id); document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
          onMove={movePage}
          onRotate={rotatePage}
          onDuplicate={duplicatePage}
          onDelete={deletePage}
        />

        <div className="document-scroll">
          <div className="document-stack">
            {pages.map((page, index) => (
              <div id={`stage-${page.id}`} key={page.id}>
                <PdfPage
                  document={pdfDocument}
                  page={page}
                  pageNumber={index + 1}
                  zoom={zoom}
                  tool={tool}
                  elements={elements.filter(({ pageId }) => pageId === page.id)}
                  selectedId={selectedId}
                  onActivate={() => setActivePageId(page.id)}
                  onSelect={(id) => setSelectedId(id)}
                  onBeginMutation={pushHistory}
                  onUpdate={updateElement}
                  onPlace={(point) => placeElement(page, point)}
                  onDraw={(drawing) => addElement({
                    id: uid("draw"), pageId: page.id, type: "draw", ...drawing,
                    opacity: 1, color: "#2f6f55", strokeWidth: 2.5,
                  })}
                />
              </div>
            ))}
          </div>
        </div>

        <PropertyInspector
          element={selectedElement}
          onBeginChange={pushHistory}
          onChange={(patch) => selectedId && updateElement(selectedId, patch)}
          onDelete={deleteSelected}
          onDuplicate={duplicateSelected}
        />
      </div>

      <SignatureDialog
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onSave={(src) => { setSignatureOpen(false); addImageSource(src, "signature"); }}
      />

      {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={15} /></button></div>}
    </main>
  );
}
