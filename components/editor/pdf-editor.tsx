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
import {
  basePageDisplaySize,
  clamp,
  cloneSnapshot,
  pageDisplaySize,
  spaceAtVisualY,
  spaceVisualTop,
  uid,
  visualYToSourceY,
} from "@/lib/editor-utils";
import { exportPdf } from "@/lib/export-pdf";
import type {
  EditorElement,
  EditorPage,
  EditorSelection,
  EditorSnapshot,
  EditorTool,
  LinkDestinationMode,
  Point,
  SpaceBand,
} from "@/types/editor";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const DEFAULT_SPACE_HEIGHT = 96;
const MIN_SPACE_HEIGHT = 24;

type PdfJsAnnotation = {
  annotationType?: number;
  subtype?: string;
  url?: string;
  dest?: string | unknown[];
};

type PdfJsPageRef = { num: number; gen: number };

const LINK_DESTINATION_MODES = new Set<LinkDestinationMode>([
  "XYZ", "Fit", "FitH", "FitV", "FitR", "FitB", "FitBH", "FitBV",
]);

const linkDestinationDetails = (destination: unknown[]) => {
  const rawMode = destination[1];
  const mode = typeof rawMode === "string"
    ? rawMode.replace(/^\//, "")
    : rawMode && typeof rawMode === "object" && "name" in rawMode
      ? String(rawMode.name).replace(/^\//, "")
      : "Fit";
  const normalizedMode = LINK_DESTINATION_MODES.has(mode as LinkDestinationMode)
    ? mode as LinkDestinationMode
    : "Fit";
  return {
    mode: normalizedMode,
    parameters: destination.slice(2).map((value) =>
      typeof value === "number" && Number.isFinite(value) ? value : null,
    ),
  };
};

export default function PdfEditor() {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState("");
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [activePageId, setActivePageId] = useState("");
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
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
    setSelection(null);
    setEditingTextId(null);
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

  const removeSpace = useCallback((pageId: string, spaceId: string) => {
    const page = pagesRef.current.find(({ id }) => id === pageId);
    const space = page?.spaces.find(({ id }) => id === spaceId);
    if (!page || !space) return;
    const top = spaceVisualTop(page, space);
    const bottom = top + space.height;

    pushHistory();
    setPages((items) => items.map((item) =>
      item.id === pageId
        ? { ...item, spaces: item.spaces.filter(({ id }) => id !== spaceId) }
        : item,
    ));
    setElements((items) => items.map((element) => {
      if (element.pageId !== pageId || element.y < top) return element;
      const y = element.y >= bottom ? element.y - space.height : top;
      return { ...element, y: Math.max(0, y) } as EditorElement;
    }));
    setSelection(null);
    setEditingTextId(null);
  }, [pushHistory]);

  const updateSpaceHeight = useCallback((pageId: string, spaceId: string, requestedHeight: number) => {
    if (!Number.isFinite(requestedHeight)) return;
    const page = pagesRef.current.find(({ id }) => id === pageId);
    const space = page?.spaces.find(({ id }) => id === spaceId);
    if (!page || !space) return;
    const top = spaceVisualTop(page, space);
    const minimumForGapElements = elementsRef.current.reduce((minimum, element) =>
      element.pageId === pageId && element.y >= top && element.y < top + space.height
        ? Math.max(minimum, element.height)
        : minimum,
    MIN_SPACE_HEIGHT);
    const nextHeight = clamp(
      Math.max(requestedHeight, minimumForGapElements),
      MIN_SPACE_HEIGHT,
      basePageDisplaySize(page).height,
    );
    const delta = nextHeight - space.height;
    if (Math.abs(delta) < 0.01) return;
    const oldBottom = top + space.height;
    const nextBottom = top + nextHeight;

    const nextPages = pagesRef.current.map((item) =>
      item.id === pageId
        ? {
            ...item,
            spaces: item.spaces.map((candidate) =>
              candidate.id === spaceId ? { ...candidate, height: nextHeight } : candidate,
            ),
          }
        : item,
    );
    const nextElements = elementsRef.current.map((element) => {
      if (element.pageId !== pageId || element.y < top) return element;
      if (element.y >= oldBottom) {
        return { ...element, y: element.y + delta } as EditorElement;
      }
      if (delta < 0 && element.y + element.height > nextBottom) {
        return {
          ...element,
          y: Math.max(top, nextBottom - element.height),
        } as EditorElement;
      }
      return element;
    });

    pagesRef.current = nextPages;
    elementsRef.current = nextElements;
    setPages(nextPages);
    setElements(nextElements);
  }, []);

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
      } else if (!editingField && (event.key === "Delete" || event.key === "Backspace") && selection) {
        event.preventDefault();
        if (selection.kind === "space") {
          removeSpace(selection.pageId, selection.id);
        } else {
          pushHistory();
          setElements((items) => items.filter(({ id }) => id !== selection.id));
          setSelection(null);
          setEditingTextId(null);
        }
      } else if (event.key === "Escape") {
        setEditingTextId(null);
        setSelection(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [pushHistory, redo, removeSpace, selection, undo]);

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
          const annotations = await pdfPage.getAnnotations({ intent: "any" }) as PdfJsAnnotation[];
          const linkAnnotations = annotations.filter((annotation) =>
            annotation.annotationType === pdfjs.AnnotationType.LINK || annotation.subtype === "Link",
          );
          const links = await Promise.all(linkAnnotations.map(async (annotation) => {
            const internal = !annotation.url && annotation.dest !== undefined;
            if (!internal) return { internal: false };

            try {
              const destination = typeof annotation.dest === "string"
                ? await document.getDestination(annotation.dest)
                : annotation.dest;
              const destinationDetails = Array.isArray(destination)
                ? linkDestinationDetails(destination)
                : undefined;
              const target = Array.isArray(destination) ? destination[0] : undefined;
              if (typeof target === "number" && Number.isInteger(target)) {
                return {
                  internal: true,
                  targetSourceIndex: target,
                  destination: destinationDetails,
                };
              }
              if (
                target
                && typeof target === "object"
                && "num" in target
                && "gen" in target
              ) {
                const targetSourceIndex = await document.getPageIndex(target as PdfJsPageRef);
                return {
                  internal: true,
                  targetSourceIndex,
                  destination: destinationDetails,
                };
              }
              return { internal: true, destination: destinationDetails };
            } catch (linkError) {
              console.warn("Could not resolve an internal PDF link", linkError);
            }
            return { internal: true };
          }));
          return {
            id: uid("page"),
            sourceIndex,
            width: viewport.width,
            height: viewport.height,
            originalRotation: pdfPage.rotate,
            rotation: 0,
            hasFormFields: annotations.some((annotation) =>
              annotation.annotationType === pdfjs.AnnotationType.WIDGET || annotation.subtype === "Widget",
            ),
            links,
            spaces: [],
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
      setSelection(null);
      setEditingTextId(null);
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

  const addElement = (element: EditorElement, startTextEditing = false) => {
    pushHistory();
    setElements((items) => [...items, element]);
    setSelection({ kind: "element", id: element.id });
    setEditingTextId(startTextEditing ? element.id : null);
    setTool("select");
  };

  const placeElement = (page: EditorPage, point: Point) => {
    const size = pageDisplaySize(page);
    if (tool === "space") {
      if (page.hasFormFields) {
        setNotice("This page contains interactive form fields. Fill or flatten the form before inserting Space.");
        setTool("select");
        return;
      }
      const existing = spaceAtVisualY(page, point.y);
      if (existing) {
        setSelection({ kind: "space", pageId: page.id, id: existing.id });
        setTool("select");
        return;
      }
      const base = basePageDisplaySize(page);
      const space: SpaceBand = {
        id: uid("space"),
        sourceY: clamp(visualYToSourceY(page, point.y), 0, base.height),
        height: DEFAULT_SPACE_HEIGHT,
      };
      pushHistory();
      setPages((items) => items.map((item) =>
        item.id === page.id ? { ...item, spaces: [...item.spaces, space] } : item,
      ));
      setElements((items) => items.map((element) =>
        element.pageId === page.id && element.y >= point.y
          ? { ...element, y: element.y + space.height } as EditorElement
          : element,
      ));
      setSelection({ kind: "space", pageId: page.id, id: space.id });
      setEditingTextId(null);
      setTool("select");
      return;
    }
    if (tool === "text") {
      const textElement: EditorElement = {
        id: uid("text"), pageId: page.id, type: "text",
        x: Math.max(0, Math.min(point.x, size.width - 190)),
        y: Math.max(0, Math.min(point.y, size.height - 52)),
        width: 190, height: 52, opacity: 1, text: "",
        fontSize: 18, fontFamily: "Helvetica", color: "#17211b", bold: false, align: "left",
      };
      addElement(textElement, true);
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
    const size = pageDisplaySize(page);
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
    if (!selection) return;
    if (selection.kind === "space") {
      removeSpace(selection.pageId, selection.id);
      return;
    }
    pushHistory();
    setElements((items) => items.filter(({ id }) => id !== selection.id));
    setSelection(null);
    setEditingTextId(null);
  };

  const duplicateSelected = () => {
    if (selection?.kind !== "element") return;
    const original = elementsRef.current.find(({ id }) => id === selection.id);
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
    if (page.spaces.length > 0) {
      setNotice("Remove inserted spaces before rotating this page.");
      return;
    }
    const oldSize = basePageDisplaySize(page);
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
    const copy = {
      ...structuredClone(pagesRef.current[index]),
      id: copyId,
      spaces: pagesRef.current[index].spaces.map((space) => ({
        ...space,
        id: uid("space"),
      })),
    };
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
    setSelection(null);
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

  const selectedElement = selection?.kind === "element"
    ? elements.find(({ id }) => id === selection.id)
    : undefined;
  const selectedSpacePage = selection?.kind === "space"
    ? pages.find(({ id }) => id === selection.pageId)
    : undefined;
  const selectedSpace = selection?.kind === "space"
    ? selectedSpacePage?.spaces.find(({ id }) => id === selection.id)
    : undefined;

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
        onTool={(next) => { setTool(next); setSelection(null); setEditingTextId(null); }}
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
                  selectedElementId={selection?.kind === "element" ? selection.id : null}
                  selectedSpaceId={selection?.kind === "space" && selection.pageId === page.id ? selection.id : null}
                  editingTextId={editingTextId}
                  onActivate={() => setActivePageId(page.id)}
                  onSelectElement={(id) => {
                    setSelection(id ? { kind: "element", id } : null);
                    if (id !== editingTextId) setEditingTextId(null);
                  }}
                  onSelectSpace={(id) => {
                    setSelection({ kind: "space", pageId: page.id, id });
                    setEditingTextId(null);
                  }}
                  onStartTextEditing={(id) => {
                    if (editingTextId === id) return;
                    pushHistory();
                    setSelection({ kind: "element", id });
                    setEditingTextId(id);
                  }}
                  onFinishTextEditing={() => setEditingTextId(null)}
                  onBeginMutation={pushHistory}
                  onUpdate={updateElement}
                  onResizeSpace={(id, height) => updateSpaceHeight(page.id, id, height)}
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
          space={selectedSpace}
          spaceTop={selectedSpace && selectedSpacePage ? spaceVisualTop(selectedSpacePage, selectedSpace) : undefined}
          onBeginChange={pushHistory}
          onChange={(patch) => selection?.kind === "element" && updateElement(selection.id, patch)}
          onSpaceHeightChange={(height) => {
            if (selection?.kind === "space") updateSpaceHeight(selection.pageId, selection.id, height);
          }}
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
