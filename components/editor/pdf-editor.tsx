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
  elementVisualBounds,
  elementsVisualBounds,
  lineGeometryFromMetrics,
  pageDisplaySize,
  spaceAtVisualY,
  spaceVisualTop,
  translateElement,
  type VisualBounds,
  uid,
  visualYToSourceY,
} from "@/lib/editor-utils";
import { exportPdf, FontExportError } from "@/lib/export-pdf";
import { exportVisibleOnlyPdf } from "@/lib/export-visible-pdf";
import {
  DEFAULT_EDITOR_STYLE_PREFERENCES,
  loadEditorStylePreferences,
  rememberElementStyle,
  saveEditorStylePreferences,
} from "@/lib/editor-preferences";
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

const elementVerticalBounds = (element: EditorElement) => {
  if (element.type !== "line") {
    return { top: element.y, bottom: element.y + element.height, height: element.height };
  }
  const startY = element.y + element.start.y * element.height;
  const endY = element.y + element.end.y * element.height;
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  return { top, bottom, height: bottom - top };
};

const fitElementToPage = (
  element: EditorElement,
  pageWidth: number,
  pageHeight: number,
): EditorElement => {
  const horizontalScale = element.width > 0 ? pageWidth / element.width : 1;
  const verticalScale = element.height > 0 ? pageHeight / element.height : 1;
  const scale = Math.min(1, horizontalScale, verticalScale);
  const fitted = {
    ...structuredClone(element),
    width: element.width * scale,
    height: element.height * scale,
  } as EditorElement;
  if (fitted.type === "draw") {
    return {
      ...fitted,
      points: fitted.points.map((point) => ({ x: point.x * scale, y: point.y * scale })),
    };
  }
  if (fitted.type === "text") {
    return { ...fitted, fontSize: Math.max(0.1, fitted.fontSize * scale) };
  }
  return fitted;
};

type EditorClipboard =
  | { kind: "elements"; elements: EditorElement[]; primaryId: string }
  | { kind: "space"; pageId: string; space: SpaceBand };

type AlignmentAction =
  | "left"
  | "horizontal-center"
  | "right"
  | "top"
  | "vertical-middle"
  | "bottom"
  | "baseline"
  | "distribute-horizontal"
  | "distribute-vertical";

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
  const [guidesEnabled, setGuidesEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [past, setPast] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"standard" | "visible" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const pagesRef = useRef(pages);
  const elementsRef = useRef(elements);
  const selectionRef = useRef(selection);
  const stylePreferencesRef = useRef(DEFAULT_EDITOR_STYLE_PREFERENCES);
  const clipboardRef = useRef<EditorClipboard | null>(null);
  const pasteSequenceRef = useRef<{ pageId: string | null; count: number }>({
    pageId: null,
    count: 0,
  });

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => {
    stylePreferencesRef.current = loadEditorStylePreferences();
  }, []);
  useEffect(() => () => { void loadingTaskRef.current?.destroy(); }, []);

  const updateSelection = useCallback((next: EditorSelection) => {
    selectionRef.current = next;
    setSelection(next);
  }, []);

  const updateElements = useCallback((next: EditorElement[]) => {
    elementsRef.current = next;
    setElements(next);
  }, []);

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
    pagesRef.current = value.pages;
    elementsRef.current = value.elements;
    setPages(value.pages);
    setElements(value.elements);
    updateSelection(null);
    setEditingTextId(null);
    if (!value.pages.some(({ id }) => id === activePageId)) {
      setActivePageId(value.pages[0]?.id ?? "");
    }
  }, [activePageId, updateSelection]);

  const undo = useCallback(() => {
    const previous = past.at(-1);
    if (!previous) return;
    const current = snapshot();
    setFuture((items) => [current, ...items].slice(0, 50));
    setPast((items) => items.slice(0, -1));
    restore(previous);
  }, [past, restore, snapshot]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    const current = snapshot();
    setPast((items) => [...items, current].slice(-50));
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
    const nextPages = pagesRef.current.map((item) =>
      item.id === pageId
        ? { ...item, spaces: item.spaces.filter(({ id }) => id !== spaceId) }
        : item,
    );
    const nextElements = elementsRef.current.map((element) => {
      if (element.pageId !== pageId) return element;
      const bounds = elementVerticalBounds(element);
      if (bounds.top < top) return element;
      const y = bounds.top >= bottom
        ? element.y - space.height
        : element.y + top - bounds.top;
      return { ...element, y: Math.max(0, y) } as EditorElement;
    });
    pagesRef.current = nextPages;
    setPages(nextPages);
    updateElements(nextElements);
    updateSelection(null);
    setEditingTextId(null);
  }, [pushHistory, updateElements, updateSelection]);

  const updateSpaceHeight = useCallback((pageId: string, spaceId: string, requestedHeight: number) => {
    if (!Number.isFinite(requestedHeight)) return;
    const page = pagesRef.current.find(({ id }) => id === pageId);
    const space = page?.spaces.find(({ id }) => id === spaceId);
    if (!page || !space) return;
    const top = spaceVisualTop(page, space);
    const minimumForGapElements = elementsRef.current.reduce((minimum, element) => {
      const bounds = elementVerticalBounds(element);
      return element.pageId === pageId && bounds.top >= top && bounds.top < top + space.height
        ? Math.max(minimum, bounds.height)
        : minimum;
    }, MIN_SPACE_HEIGHT);
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
      if (element.pageId !== pageId) return element;
      const bounds = elementVerticalBounds(element);
      if (bounds.top < top) return element;
      if (bounds.top >= oldBottom) {
        return { ...element, y: element.y + delta } as EditorElement;
      }
      if (delta < 0 && bounds.bottom > nextBottom) {
        const nextVisualTop = Math.max(top, nextBottom - bounds.height);
        return {
          ...element,
          y: element.y + nextVisualTop - bounds.top,
        } as EditorElement;
      }
      return element;
    });

    pagesRef.current = nextPages;
    elementsRef.current = nextElements;
    setPages(nextPages);
    setElements(nextElements);
  }, []);

  const copySelected = useCallback(() => {
    const currentSelection = selectionRef.current;
    if (!currentSelection) return false;
    if (currentSelection.kind === "elements") {
      const selectedIds = new Set(currentSelection.ids);
      const selected = elementsRef.current
        .filter(({ id }) => selectedIds.has(id))
        .map((element) => structuredClone(element));
      if (selected.length === 0) return false;
      clipboardRef.current = {
        kind: "elements",
        elements: selected,
        primaryId: currentSelection.primaryId,
      };
      setNotice(`${selected.length === 1 ? "Element" : `${selected.length} elements`} copied — press Ctrl/Cmd+V to paste`);
    } else {
      const page = pagesRef.current.find(({ id }) => id === currentSelection.pageId);
      const space = page?.spaces.find(({ id }) => id === currentSelection.id);
      if (!page || !space) return false;
      clipboardRef.current = {
        kind: "space",
        pageId: page.id,
        space: structuredClone(space),
      };
      setNotice("Blank space copied — press Ctrl/Cmd+V to paste");
    }
    pasteSequenceRef.current = { pageId: null, count: 0 };
    return true;
  }, []);

  const pasteClipboard = useCallback(() => {
    const payload = clipboardRef.current;
    if (!payload) return false;
    const sourcePageId = payload.kind === "elements"
      ? payload.elements[0]?.pageId
      : payload.pageId;
    const targetPage = pagesRef.current.find(({ id }) => id === activePageId)
      ?? pagesRef.current.find(({ id }) => id === sourcePageId)
      ?? pagesRef.current[0];
    if (!targetPage) return false;

    const sequence = pasteSequenceRef.current.pageId === targetPage.id
      ? pasteSequenceRef.current.count + 1
      : 1;
    const offset = sequence * 14;

    if (payload.kind === "elements") {
      const size = pageDisplaySize(targetPage);
      const sourceElements = payload.elements.length === 1
        ? [fitElementToPage(payload.elements[0], size.width, size.height)]
        : payload.elements.map((element) => structuredClone(element));
      const bounds = elementsVisualBounds(sourceElements);
      if (!bounds) return false;
      if (
        sourceElements.length > 1
        && (bounds.width > size.width || bounds.height > size.height)
      ) {
        setNotice("This group is larger than the target page and cannot be pasted.");
        return true;
      }
      const deltaX = clamp(offset, -bounds.left, size.width - bounds.right);
      const deltaY = clamp(offset, -bounds.top, size.height - bounds.bottom);
      let pastedPrimaryId: string | undefined;
      const pasted = sourceElements.map((original) => {
        const id = uid(original.type);
        if (original.id === payload.primaryId) pastedPrimaryId = id;
        return translateElement(
          {
            ...structuredClone(original),
            id,
            pageId: targetPage.id,
          } as EditorElement,
          deltaX,
          deltaY,
          size.width,
          size.height,
        );
      });
      pushHistory();
      updateElements([...elementsRef.current, ...pasted]);
      const ids = pasted.map(({ id }) => id);
      updateSelection({
        kind: "elements",
        pageId: targetPage.id,
        ids,
        primaryId: pastedPrimaryId ?? ids.at(-1)!,
      });
      setEditingTextId(null);
      setTool("select");
      setActivePageId(targetPage.id);
      setNotice(`${pasted.length === 1 ? "Element" : `${pasted.length} elements`} pasted`);
    } else {
      if (targetPage.hasFormFields) {
        setNotice("This page contains interactive form fields. Fill or flatten the form before pasting Space.");
        return true;
      }
      const base = basePageDisplaySize(targetPage);
      const pastedSpace: SpaceBand = {
        ...structuredClone(payload.space),
        id: uid("space"),
        sourceY: clamp(payload.space.sourceY + offset, 0, base.height),
        height: clamp(payload.space.height, MIN_SPACE_HEIGHT, base.height),
      };
      const nextTargetPage = {
        ...targetPage,
        spaces: [...targetPage.spaces, pastedSpace],
      };
      const insertionTop = spaceVisualTop(nextTargetPage, pastedSpace);
      const nextPages = pagesRef.current.map((page) =>
        page.id === targetPage.id ? nextTargetPage : page,
      );
      const nextElements = elementsRef.current.map((element) =>
        element.pageId === targetPage.id && elementVerticalBounds(element).top >= insertionTop
          ? { ...element, y: element.y + pastedSpace.height } as EditorElement
          : element,
      );
      pushHistory();
      pagesRef.current = nextPages;
      setPages(nextPages);
      updateElements(nextElements);
      updateSelection({ kind: "space", pageId: targetPage.id, id: pastedSpace.id });
      setEditingTextId(null);
      setTool("select");
      setActivePageId(targetPage.id);
      setNotice("Blank space pasted");
    }

    pasteSequenceRef.current = { pageId: targetPage.id, count: sequence };
    return true;
  }, [activePageId, pushHistory, updateElements, updateSelection]);

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
      pagesRef.current = loadedPages;
      elementsRef.current = [];
      setPages(loadedPages);
      setElements([]);
      setPast([]);
      setFuture([]);
      updateSelection(null);
      setEditingTextId(null);
      clipboardRef.current = null;
      pasteSequenceRef.current = { pageId: null, count: 0 };
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
    updateElements([...elementsRef.current, element]);
    updateSelection({
      kind: "elements",
      pageId: element.pageId,
      ids: [element.id],
      primaryId: element.id,
    });
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
        updateSelection({ kind: "space", pageId: page.id, id: existing.id });
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
      const nextPages = pagesRef.current.map((item) =>
        item.id === page.id ? { ...item, spaces: [...item.spaces, space] } : item,
      );
      const nextElements = elementsRef.current.map((element) =>
        element.pageId === page.id && elementVerticalBounds(element).top >= point.y
          ? { ...element, y: element.y + space.height } as EditorElement
          : element,
      );
      pagesRef.current = nextPages;
      setPages(nextPages);
      updateElements(nextElements);
      updateSelection({ kind: "space", pageId: page.id, id: space.id });
      setEditingTextId(null);
      setTool("select");
      return;
    }
    const styles = stylePreferencesRef.current;
    if (tool === "text") {
      const textElement: EditorElement = {
        id: uid("text"), pageId: page.id, type: "text",
        x: Math.max(0, Math.min(point.x, size.width - 190)),
        y: Math.max(0, Math.min(point.y, size.height - 52)),
        width: 190, height: 52, text: "", ...styles.text,
      };
      addElement(textElement, true);
    } else if (tool === "highlight") {
      addElement({
        id: uid("highlight"), pageId: page.id, type: "highlight",
        x: Math.max(0, Math.min(point.x, size.width - 160)), y: Math.max(0, Math.min(point.y, size.height - 32)),
        width: 160, height: 32, ...styles.highlight,
      });
    } else if (tool === "redact") {
      addElement({
        id: uid("redact"), pageId: page.id, type: "redact",
        x: Math.max(0, Math.min(point.x, size.width - 160)), y: Math.max(0, Math.min(point.y, size.height - 32)),
        width: 160, height: 32, ...styles.redact,
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
      width, height, ...stylePreferencesRef.current[kind],
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
    const element = elementsRef.current.find((candidate) => candidate.id === id);
    if (element) {
      const preferences = rememberElementStyle(stylePreferencesRef.current, element, patch);
      if (preferences !== stylePreferencesRef.current) {
        stylePreferencesRef.current = preferences;
        saveEditorStylePreferences(preferences);
      }
    }
    updateElements(elementsRef.current.map((candidate) =>
      candidate.id === id ? ({ ...candidate, ...patch } as EditorElement) : candidate,
    ));
  };

  const updateElementBatch = useCallback((updates: EditorElement[]) => {
    const byId = new Map(updates.map((element) => [element.id, element]));
    updateElements(elementsRef.current.map((element) => byId.get(element.id) ?? element));
  }, [updateElements]);

  const updateSelectedElements = (patch: Partial<EditorElement>) => {
    const currentSelection = selectionRef.current;
    if (currentSelection?.kind !== "elements") return;
    const primary = elementsRef.current.find(({ id }) => id === currentSelection.primaryId);
    if (primary) {
      const preferences = rememberElementStyle(stylePreferencesRef.current, primary, patch);
      if (preferences !== stylePreferencesRef.current) {
        stylePreferencesRef.current = preferences;
        saveEditorStylePreferences(preferences);
      }
    }
    const ids = new Set(currentSelection.ids);
    updateElements(elementsRef.current.map((element) =>
      ids.has(element.id) ? ({ ...element, ...patch } as EditorElement) : element,
    ));
  };

  const deleteSelected = useCallback(() => {
    const currentSelection = selectionRef.current;
    if (!currentSelection) return;
    if (currentSelection.kind === "space") {
      removeSpace(currentSelection.pageId, currentSelection.id);
      return;
    }
    const ids = new Set(currentSelection.ids);
    pushHistory();
    updateElements(elementsRef.current.filter(({ id }) => !ids.has(id)));
    updateSelection(null);
    setEditingTextId(null);
  }, [pushHistory, removeSpace, updateElements, updateSelection]);

  const duplicateSelected = useCallback(() => {
    const currentSelection = selectionRef.current;
    if (currentSelection?.kind !== "elements") return false;
    const ids = new Set(currentSelection.ids);
    const originals = elementsRef.current.filter(({ id }) => ids.has(id));
    const page = pagesRef.current.find(({ id }) => id === currentSelection.pageId);
    if (!page || originals.length === 0) return false;
    const size = pageDisplaySize(page);
    const bounds = elementsVisualBounds(originals);
    if (!bounds || bounds.width > size.width || bounds.height > size.height) {
      setNotice("This group is larger than the page and cannot be duplicated.");
      return true;
    }
    const deltaX = clamp(14, -bounds.left, size.width - bounds.right);
    const deltaY = clamp(14, -bounds.top, size.height - bounds.bottom);
    let duplicatePrimaryId: string | undefined;
    const duplicates = originals.map((original) => {
      const id = uid(original.type);
      if (original.id === currentSelection.primaryId) duplicatePrimaryId = id;
      return translateElement(
        { ...structuredClone(original), id } as EditorElement,
        deltaX,
        deltaY,
        size.width,
        size.height,
      );
    });
    pushHistory();
    updateElements([...elementsRef.current, ...duplicates]);
    const duplicateIds = duplicates.map(({ id }) => id);
    updateSelection({
      kind: "elements",
      pageId: page.id,
      ids: duplicateIds,
      primaryId: duplicatePrimaryId ?? duplicateIds.at(-1)!,
    });
    setEditingTextId(null);
    setTool("select");
    return true;
  }, [pushHistory, updateElements, updateSelection]);

  const cutSelected = useCallback(() => {
    if (!copySelected()) return false;
    deleteSelected();
    setNotice("Selection cut — press Ctrl/Cmd+V to paste");
    return true;
  }, [copySelected, deleteSelected]);

  const nudgeSelected = useCallback((deltaX: number, deltaY: number) => {
    const currentSelection = selectionRef.current;
    if (currentSelection?.kind !== "elements") return false;
    const ids = new Set(currentSelection.ids);
    const selected = elementsRef.current.filter(({ id }) => ids.has(id));
    const page = pagesRef.current.find(({ id }) => id === currentSelection.pageId);
    const bounds = elementsVisualBounds(selected);
    if (!page || !bounds) return false;
    const size = pageDisplaySize(page);
    const clampedX = clamp(deltaX, -bounds.left, size.width - bounds.right);
    const clampedY = clamp(deltaY, -bounds.top, size.height - bounds.bottom);
    if (clampedX === 0 && clampedY === 0) return true;
    pushHistory();
    updateElementBatch(selected.map((element) =>
      translateElement(element, clampedX, clampedY, size.width, size.height),
    ));
    setEditingTextId(null);
    return true;
  }, [pushHistory, updateElementBatch]);

  const selectAllCurrentPage = useCallback(() => {
    const ids = elementsRef.current
      .filter(({ pageId }) => pageId === activePageId)
      .map(({ id }) => id);
    updateSelection(ids.length > 0
      ? { kind: "elements", pageId: activePageId, ids, primaryId: ids.at(-1)! }
      : null);
    setEditingTextId(null);
  }, [activePageId, updateSelection]);

  const alignSelected = (action: AlignmentAction) => {
    const currentSelection = selectionRef.current;
    if (currentSelection?.kind !== "elements" || currentSelection.ids.length < 2) return;
    const ids = new Set(currentSelection.ids);
    const selected = elementsRef.current.filter(({ id }) => ids.has(id));
    const primary = selected.find(({ id }) => id === currentSelection.primaryId);
    const page = pagesRef.current.find(({ id }) => id === currentSelection.pageId);
    if (!primary || !page) return;
    const size = pageDisplaySize(page);
    const primaryBounds = elementVisualBounds(primary);
    const translateWithinPage = (element: EditorElement, deltaX: number, deltaY: number) => {
      const bounds = elementVisualBounds(element);
      return translateElement(
        element,
        clamp(deltaX, -bounds.left, size.width - bounds.right),
        clamp(deltaY, -bounds.top, size.height - bounds.bottom),
        size.width,
        size.height,
      );
    };
    let updates: EditorElement[] = [];

    if (action === "distribute-horizontal" || action === "distribute-vertical") {
      if (selected.length < 3) return;
      const horizontal = action === "distribute-horizontal";
      const entries = selected.map((element) => ({ element, bounds: elementVisualBounds(element) }));
      const start = (value: VisualBounds) => horizontal ? value.left : value.top;
      const end = (value: VisualBounds) => horizontal ? value.right : value.bottom;
      const extent = (value: VisualBounds) => horizontal ? value.width : value.height;
      const startEntry = entries.reduce((outer, candidate) => {
        const difference = start(candidate.bounds) - start(outer.bounds);
        return difference < 0 || (difference === 0 && end(candidate.bounds) < end(outer.bounds))
          ? candidate
          : outer;
      });
      const endEntry = entries.reduce((outer, candidate) => {
        const difference = end(candidate.bounds) - end(outer.bounds);
        const startDifference = start(candidate.bounds) - start(outer.bounds);
        return difference > 0
          || (difference === 0 && startDifference > 0)
          || (difference === 0 && startDifference === 0 && candidate.element.id !== outer.element.id)
          ? candidate
          : outer;
      });
      if (startEntry.element.id === endEntry.element.id) return;
      const middleEntries = entries
        .filter(({ element }) => element.id !== startEntry.element.id && element.id !== endEntry.element.id)
        .sort((left, right) => start(left.bounds) - start(right.bounds));
      const span = end(endEntry.bounds) - start(startEntry.bounds);
      const occupied = entries.reduce((total, { bounds }) => total + extent(bounds), 0);
      const gap = (span - occupied) / (entries.length - 1);
      let cursor = end(startEntry.bounds) + gap;
      updates = middleEntries.map(({ element, bounds }) => {
        const delta = cursor - start(bounds);
        cursor += extent(bounds) + gap;
        return translateWithinPage(element, horizontal ? delta : 0, horizontal ? 0 : delta);
      });
    } else {
      if (action === "baseline" && selected.some(({ type }) => type !== "text")) return;
      updates = selected
        .filter(({ id }) => id !== primary.id)
        .map((element) => {
          const bounds = elementVisualBounds(element);
          let deltaX = 0;
          let deltaY = 0;
          if (action === "left") deltaX = primaryBounds.left - bounds.left;
          if (action === "horizontal-center") {
            deltaX = primaryBounds.left + primaryBounds.width / 2 - bounds.left - bounds.width / 2;
          }
          if (action === "right") deltaX = primaryBounds.right - bounds.right;
          if (action === "top") deltaY = primaryBounds.top - bounds.top;
          if (action === "vertical-middle") {
            deltaY = primaryBounds.top + primaryBounds.height / 2 - bounds.top - bounds.height / 2;
          }
          if (action === "bottom") deltaY = primaryBounds.bottom - bounds.bottom;
          if (action === "baseline" && element.type === "text" && primary.type === "text") {
            deltaY = primary.y + primary.fontSize - element.y - element.fontSize;
          }
          return translateWithinPage(element, deltaX, deltaY);
        });
    }
    if (updates.length === 0) return;
    pushHistory();
    updateElementBatch(updates);
    setEditingTextId(null);
  };

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingField = Boolean(
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target?.isContentEditable,
      );
      if (editingField) return;
      const shortcut = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (shortcut && key === "c") {
        if (copySelected()) event.preventDefault();
      } else if (shortcut && key === "x") {
        if (cutSelected()) event.preventDefault();
      } else if (shortcut && key === "v") {
        if (pasteClipboard()) event.preventDefault();
      } else if (shortcut && key === "d") {
        if (duplicateSelected()) event.preventDefault();
      } else if (shortcut && key === "a") {
        event.preventDefault();
        selectAllCurrentPage();
      } else if (shortcut && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (shortcut && key === "y") {
        event.preventDefault();
        redo();
      } else if (!shortcut && !event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        const amount = event.shiftKey ? 10 : 1;
        const moved = event.key === "ArrowLeft"
          ? nudgeSelected(-amount, 0)
          : event.key === "ArrowRight"
            ? nudgeSelected(amount, 0)
            : event.key === "ArrowUp"
              ? nudgeSelected(0, -amount)
              : nudgeSelected(0, amount);
        if (moved) event.preventDefault();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectionRef.current) {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "Escape") {
        setEditingTextId(null);
        updateSelection(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [
    copySelected,
    cutSelected,
    deleteSelected,
    duplicateSelected,
    nudgeSelected,
    pasteClipboard,
    redo,
    selectAllCurrentPage,
    undo,
    updateSelection,
  ]);

  const movePage = (pageId: string, direction: -1 | 1) => {
    const index = pagesRef.current.findIndex(({ id }) => id === pageId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= pagesRef.current.length) return;
    pushHistory();
    const nextPages = [...pagesRef.current];
    [nextPages[index], nextPages[destination]] = [nextPages[destination], nextPages[index]];
    pagesRef.current = nextPages;
    setPages(nextPages);
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
    const nextPages = pagesRef.current.map((item) =>
      item.id === pageId ? { ...item, rotation: (item.rotation + 90) % 360 } : item,
    );
    const nextElements = elementsRef.current.map((element) => {
      if (element.pageId !== pageId) return element;
      const rotated = {
        ...element,
        x: Math.max(0, oldSize.height - element.y - element.height),
        y: element.x,
        width: element.height,
        height: element.width,
      } as EditorElement;
      if (element.type === "line") {
        return {
          ...rotated,
          start: { x: 1 - element.start.y, y: element.start.x },
          end: { x: 1 - element.end.y, y: element.end.x },
        } as EditorElement;
      }
      return rotated;
    });
    pagesRef.current = nextPages;
    setPages(nextPages);
    updateElements(nextElements);
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
    const nextPages = [
      ...pagesRef.current.slice(0, index + 1),
      copy,
      ...pagesRef.current.slice(index + 1),
    ];
    pagesRef.current = nextPages;
    setPages(nextPages);
    updateElements([...elementsRef.current, ...copiedElements]);
    updateSelection(null);
    setEditingTextId(null);
    setActivePageId(copyId);
  };

  const deletePage = (pageId: string) => {
    if (pagesRef.current.length <= 1) return;
    const index = pagesRef.current.findIndex(({ id }) => id === pageId);
    pushHistory();
    const nextActivePageId = activePageId === pageId
      ? pagesRef.current[index + 1]?.id ?? pagesRef.current[index - 1]?.id ?? ""
      : activePageId;
    const nextPages = pagesRef.current.filter(({ id }) => id !== pageId);
    pagesRef.current = nextPages;
    setPages(nextPages);
    updateElements(elementsRef.current.filter((element) => element.pageId !== pageId));
    updateSelection(null);
    setEditingTextId(null);
    setActivePageId(nextActivePageId);
  };

  const savePdfDownload = (bytes: Uint8Array, suffix: string) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName.replace(/\.pdf$/i, "") || "document"}-${suffix}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPdf = async () => {
    if (!sourceBytes || !pages.length) return;
    setExporting("standard");
    setNotice(null);
    try {
      const bytes = await exportPdf(sourceBytes, pages, elements);
      savePdfDownload(bytes, "edited");
      setNotice("Your edited PDF has been downloaded");
    } catch (caught) {
      const fontError = caught instanceof FontExportError;
      if (!fontError) console.error(caught);
      setNotice(
        fontError
          ? caught.message
          : "Export failed. This PDF may have restrictions that prevent editing.",
      );
    } finally {
      setExporting(null);
    }
  };

  const downloadVisibleOnlyPdf = async () => {
    if (!sourceBytes || !pages.length) return;
    setExporting("visible");
    setNotice("Preparing image-only visible PDF…");
    try {
      const bytes = await exportVisibleOnlyPdf(
        sourceBytes,
        pages,
        elements,
        (pageNumber, pageCount) => setNotice(`Flattening page ${pageNumber} of ${pageCount}…`),
      );
      savePdfDownload(bytes, "visible-only");
      setNotice("Your visible-only image PDF has been downloaded. Hidden PDF objects were not retained.");
    } catch (caught) {
      const fontError = caught instanceof FontExportError;
      if (!fontError) console.error(caught);
      setNotice(
        fontError
          ? caught.message
          : "Visible-only export failed while rendering this PDF.",
      );
    } finally {
      setExporting(null);
    }
  };

  const startNewDocument = () => {
    if (past.length > 0 && !window.confirm("Open another PDF? Unsaved edits in this document will be cleared.")) return;
    replaceInputRef.current?.click();
  };

  if (!pdfDocument) {
    return <UploadScreen busy={loading} error={error} onFile={loadFile} />;
  }

  const selectedElements = selection?.kind === "elements"
    ? elements.filter(({ id }) => selection.ids.includes(id))
    : [];
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : undefined;
  const selectedElementPage = selection?.kind === "elements"
    ? pages.find(({ id }) => id === selection.pageId)
    : undefined;
  const selectedElementPageSize = selectedElementPage
    ? pageDisplaySize(selectedElementPage)
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
        guidesEnabled={guidesEnabled}
        onTool={(next) => { setTool(next); updateSelection(null); setEditingTextId(null); }}
        onUndo={undo}
        onRedo={redo}
        onZoom={setZoom}
        onImage={addImageFile}
        onSignature={() => setSignatureOpen(true)}
        onToggleGuides={() => {
          setGuidesEnabled((enabled) => {
            const next = !enabled;
            setNotice(next
              ? "Guides and 6 pt snapping are on. Hold Alt while dragging to move freely."
              : "Alignment guides are off");
            return next;
          });
        }}
        onExport={() => void downloadPdf()}
        onExportVisible={() => void downloadVisibleOnlyPdf()}
      />

      <div className="editor-workspace">
        <PagesSidebar
          document={pdfDocument}
          pages={pages}
          activePageId={activePageId}
          onSelect={(id) => {
            if (id !== activePageId) {
              updateSelection(null);
              setEditingTextId(null);
            }
            setActivePageId(id);
            document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
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
                  guidesEnabled={guidesEnabled}
                  elements={elements.filter(({ pageId }) => pageId === page.id)}
                  selectedElementIds={selection?.kind === "elements" && selection.pageId === page.id
                    ? selection.ids
                    : []}
                  primaryElementId={selection?.kind === "elements" && selection.pageId === page.id
                    ? selection.primaryId
                    : null}
                  selectedSpaceId={selection?.kind === "space" && selection.pageId === page.id ? selection.id : null}
                  editingTextId={editingTextId}
                  onActivate={() => {
                    if (activePageId !== page.id) {
                      updateSelection(null);
                      setEditingTextId(null);
                    }
                    setActivePageId(page.id);
                  }}
                  onSelectElement={(id, mode) => {
                    setActivePageId(page.id);
                    const current = selectionRef.current;
                    if (mode === "toggle") {
                      const currentIds = current?.kind === "elements" && current.pageId === page.id
                        ? current.ids
                        : [];
                      const nextIds = currentIds.includes(id)
                        ? currentIds.filter((candidate) => candidate !== id)
                        : elementsRef.current
                            .filter((element) => element.pageId === page.id
                              && (currentIds.includes(element.id) || element.id === id))
                            .map((element) => element.id);
                      if (nextIds.length === 0) {
                        updateSelection(null);
                      } else {
                        updateSelection({
                          kind: "elements",
                          pageId: page.id,
                          ids: nextIds,
                          primaryId: currentIds.includes(id)
                            ? (current?.kind === "elements" && nextIds.includes(current.primaryId)
                                ? current.primaryId
                                : nextIds.at(-1)!)
                            : id,
                        });
                      }
                    } else if (
                      mode === "only"
                      || current?.kind !== "elements"
                      || current.pageId !== page.id
                      || !current.ids.includes(id)
                    ) {
                      updateSelection({ kind: "elements", pageId: page.id, ids: [id], primaryId: id });
                    }
                    setEditingTextId(null);
                  }}
                  onMarqueeSelect={(ids, mode) => {
                    setActivePageId(page.id);
                    const current = selectionRef.current;
                    const currentIds = current?.kind === "elements" && current.pageId === page.id
                      ? current.ids
                      : [];
                    let nextSet: Set<string>;
                    if (mode === "replace") {
                      nextSet = new Set(ids);
                    } else if (mode === "add") {
                      nextSet = new Set([...currentIds, ...ids]);
                    } else {
                      nextSet = new Set(currentIds);
                      ids.forEach((id) => {
                        if (nextSet.has(id)) nextSet.delete(id); else nextSet.add(id);
                      });
                    }
                    const nextIds = elementsRef.current
                      .filter((element) => element.pageId === page.id && nextSet.has(element.id))
                      .map(({ id }) => id);
                    if (nextIds.length === 0) {
                      updateSelection(null);
                    } else {
                      const latestAdded = [...ids].reverse().find(
                        (id) => nextSet.has(id) && (mode === "replace" || !currentIds.includes(id)),
                      );
                      const primaryId = latestAdded
                        ?? (current?.kind === "elements" && nextSet.has(current.primaryId)
                          ? current.primaryId
                          : nextIds.at(-1)!);
                      updateSelection({ kind: "elements", pageId: page.id, ids: nextIds, primaryId });
                    }
                    setEditingTextId(null);
                  }}
                  onSelectSpace={(id) => {
                    setActivePageId(page.id);
                    updateSelection({ kind: "space", pageId: page.id, id });
                    setEditingTextId(null);
                  }}
                  onStartTextEditing={(id) => {
                    if (editingTextId === id) return;
                    pushHistory();
                    updateSelection({ kind: "elements", pageId: page.id, ids: [id], primaryId: id });
                    setEditingTextId(id);
                  }}
                  onFinishTextEditing={() => setEditingTextId(null)}
                  onBeginMutation={pushHistory}
                  onUpdate={updateElement}
                  onUpdateElements={updateElementBatch}
                  onResizeSpace={(id, height) => updateSpaceHeight(page.id, id, height)}
                  onPlace={(point) => placeElement(page, point)}
                  onLine={(line) => addElement({
                    id: uid("line"), pageId: page.id, type: "line", ...line,
                    ...stylePreferencesRef.current.line,
                  })}
                  onDraw={(drawing) => addElement({
                    id: uid("draw"), pageId: page.id, type: "draw", ...drawing,
                    ...stylePreferencesRef.current.draw,
                  })}
                />
              </div>
            ))}
          </div>
        </div>

        <PropertyInspector
          element={selectedElement}
          elements={selectedElements}
          primaryId={selection?.kind === "elements" ? selection.primaryId : undefined}
          space={selectedSpace}
          spaceTop={selectedSpace && selectedSpacePage ? spaceVisualTop(selectedSpacePage, selectedSpace) : undefined}
          onBeginChange={pushHistory}
          onChange={(patch) => {
            if (selection?.kind !== "elements") return;
            if (selection.ids.length > 1) updateSelectedElements(patch);
            else updateElement(selection.ids[0], patch);
          }}
          onLineMetricsChange={(angle, length) => {
            if (
              selection?.kind !== "elements"
              || selection.ids.length !== 1
              || selectedElement?.type !== "line"
              || !selectedElementPageSize
            ) return;
            const geometry = lineGeometryFromMetrics(
              selectedElement,
              angle,
              length,
              selectedElementPageSize.width,
              selectedElementPageSize.height,
            );
            updateElement(selection.ids[0], geometry as Partial<EditorElement>);
          }}
          onSpaceHeightChange={(height) => {
            if (selection?.kind === "space") updateSpaceHeight(selection.pageId, selection.id, height);
          }}
          onAlign={alignSelected}
          onDelete={deleteSelected}
          onCopy={() => { copySelected(); }}
          onCut={() => { cutSelected(); }}
          onDuplicate={() => { duplicateSelected(); }}
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
