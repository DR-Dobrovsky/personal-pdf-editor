"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { EditorElement, EditorPage, EditorTool, Point } from "@/types/editor";
import { clamp, displaySize } from "@/lib/editor-utils";

interface PdfPageProps {
  document: PDFDocumentProxy;
  page: EditorPage;
  pageNumber: number;
  zoom: number;
  tool: EditorTool;
  elements: EditorElement[];
  selectedId: string | null;
  editingTextId: string | null;
  onActivate: () => void;
  onSelect: (id: string | null) => void;
  onStartTextEditing: (id: string) => void;
  onFinishTextEditing: () => void;
  onBeginMutation: () => void;
  onUpdate: (id: string, patch: Partial<EditorElement>) => void;
  onPlace: (point: Point) => void;
  onDraw: (drawing: { x: number; y: number; width: number; height: number; points: Point[] }) => void;
}

export default function PdfPage({
  document,
  page,
  pageNumber,
  zoom,
  tool,
  elements,
  selectedId,
  editingTextId,
  onActivate,
  onSelect,
  onStartTextEditing,
  onFinishTextEditing,
  onBeginMutation,
  onUpdate,
  onPlace,
  onDraw,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState<Point[] | null>(null);
  const [pixelRatio, setPixelRatio] = useState(() =>
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  );
  const draftRef = useRef<Point[] | null>(null);
  const totalRotation = page.originalRotation + page.rotation;
  const size = displaySize(page.width, page.height, totalRotation);

  useEffect(() => {
    const updatePixelRatio = () => {
      const next = window.devicePixelRatio || 1;
      setPixelRatio((current) => current === next ? current : next);
    };
    window.addEventListener("resize", updatePixelRatio);
    return () => window.removeEventListener("resize", updatePixelRatio);
  }, []);

  useEffect(() => {
    let active = true;
    let task: RenderTask | undefined;
    void document.getPage(page.sourceIndex + 1).then((pdfPage) => {
      if (!active || !canvasRef.current) return;
      const viewport = pdfPage.getViewport({ scale: zoom, rotation: totalRotation });
      const canvas = canvasRef.current;
      const desiredOutputScale = Math.max(2, pixelRatio);
      const maxCanvasPixels = 12_000_000;
      const scaleForPixelLimit = Math.sqrt(
        maxCanvasPixels / Math.max(1, viewport.width * viewport.height),
      );
      const outputScale = Math.max(1, Math.min(desiredOutputScale, scaleForPixelLimit));
      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.dataset.outputScale = outputScale.toFixed(2);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      context.imageSmoothingEnabled = false;
      const scaleX = canvas.width / viewport.width;
      const scaleY = canvas.height / viewport.height;
      task = pdfPage.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: [scaleX, 0, 0, scaleY, 0, 0],
      });
      return task.promise;
    }).catch((error: unknown) => {
      if (active && !(error instanceof Error && error.name === "RenderingCancelledException")) console.error(error);
    });
    return () => { active = false; task?.cancel(); };
  }, [document, page.sourceIndex, pixelRatio, totalRotation, zoom]);

  const relativePoint = (
    event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
  ): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / zoom, 0, size.width),
      y: clamp((event.clientY - rect.top) / zoom, 0, size.height),
    };
  };

  return (
    <section className="page-stage" aria-label={`Page ${pageNumber}`}>
      <div
        className={`pdf-page tool-${tool}`}
        style={{ width: size.width * zoom, height: size.height * zoom }}
        onPointerDown={(event) => {
          onActivate();
          if (event.target !== event.currentTarget && event.target !== canvasRef.current) return;
          if (tool === "draw") {
            const first = relativePoint(event);
            draftRef.current = [first];
            setDraft([first]);
            event.currentTarget.setPointerCapture(event.pointerId);
          } else if (tool === "select") {
            onSelect(null);
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget && event.target !== canvasRef.current) return;
          if (tool === "text" || tool === "highlight" || tool === "redact") {
            onActivate();
            onPlace(relativePoint(event));
          }
        }}
        onPointerMove={(event) => {
          if (tool !== "draw" || !draftRef.current) return;
          const next = relativePoint(event);
          const previous = draftRef.current[draftRef.current.length - 1];
          if (Math.hypot(next.x - previous.x, next.y - previous.y) < 1.5) return;
          draftRef.current = [...draftRef.current, next];
          setDraft(draftRef.current);
        }}
        onPointerUp={() => {
          const points = draftRef.current;
          if (!points || points.length < 2) { draftRef.current = null; setDraft(null); return; }
          const xs = points.map(({ x }) => x);
          const ys = points.map(({ y }) => y);
          const x = Math.min(...xs);
          const y = Math.min(...ys);
          onDraw({
            x,
            y,
            width: Math.max(2, Math.max(...xs) - x),
            height: Math.max(2, Math.max(...ys) - y),
            points: points.map((point) => ({ x: point.x - x, y: point.y - y })),
          });
          draftRef.current = null;
          setDraft(null);
        }}
      >
        <canvas ref={canvasRef} className="pdf-canvas" />
        <div className="elements-layer">
          {elements.map((element) => (
            <EditableElement
              key={element.id}
              element={element}
              zoom={zoom}
              selected={selectedId === element.id}
              editing={editingTextId === element.id}
              pageWidth={size.width}
              pageHeight={size.height}
              enabled={tool === "select"}
              onSelect={() => onSelect(element.id)}
              onStartTextEditing={() => onStartTextEditing(element.id)}
              onFinishTextEditing={onFinishTextEditing}
              onBeginMutation={onBeginMutation}
              onUpdate={(patch) => onUpdate(element.id, patch)}
            />
          ))}
          {draft && (
            <svg className="draft-path" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
              <polyline points={draft.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="#2f6f55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <span className="page-stage-label">Page {pageNumber}</span>
    </section>
  );
}

interface EditableElementProps {
  element: EditorElement;
  zoom: number;
  selected: boolean;
  editing: boolean;
  pageWidth: number;
  pageHeight: number;
  enabled: boolean;
  onSelect: () => void;
  onStartTextEditing: () => void;
  onFinishTextEditing: () => void;
  onBeginMutation: () => void;
  onUpdate: (patch: Partial<EditorElement>) => void;
}

function EditableElement({
  element,
  zoom,
  selected,
  editing,
  pageWidth,
  pageHeight,
  enabled,
  onSelect,
  onStartTextEditing,
  onFinishTextEditing,
  onBeginMutation,
  onUpdate,
}: EditableElementProps) {
  const dragRef = useRef<{
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
    started: boolean;
  } | null>(null);
  const resizeRef = useRef<{
    pointerX: number;
    pointerY: number;
    width: number;
    height: number;
    started: boolean;
  } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing || element.type !== "text") return;
    const frame = window.requestAnimationFrame(() => {
      const input = textInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(0, input.value.length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing, element.type]);

  return (
    <div
      className={`editor-element element-${element.type} ${selected ? "is-selected" : ""} ${editing ? "is-editing" : ""}`}
      style={{
        left: element.x * zoom,
        top: element.y * zoom,
        width: element.width * zoom,
        height: element.height * zoom,
        opacity: element.opacity,
        pointerEvents: enabled || editing ? "auto" : "none",
      }}
      onPointerDown={(event) => {
        if (!enabled || editing) return;
        event.stopPropagation();
        onSelect();
        dragRef.current = {
          pointerX: event.clientX,
          pointerY: event.clientY,
          x: element.x,
          y: element.y,
          started: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) return;
        if (!dragRef.current.started) {
          dragRef.current.started = true;
          onBeginMutation();
        }
        onUpdate({
          x: clamp(dragRef.current.x + (event.clientX - dragRef.current.pointerX) / zoom, 0, pageWidth - element.width),
          y: clamp(dragRef.current.y + (event.clientY - dragRef.current.pointerY) / zoom, 0, pageHeight - element.height),
        } as Partial<EditorElement>);
      }}
      onPointerUp={() => {
        const interaction = dragRef.current;
        dragRef.current = null;
        if (interaction && !interaction.started && selected && element.type === "text") {
          onStartTextEditing();
        }
      }}
    >
      {element.type === "text" && (editing ? (
        <textarea
          ref={textInputRef}
          className="inline-text-editor"
          aria-label="Edit text"
          placeholder="Type here…"
          value={element.text}
          style={{
            color: element.color,
            fontFamily: element.fontFamily,
            fontSize: element.fontSize * zoom,
            fontWeight: element.bold ? 700 : 400,
            textAlign: element.align,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onUpdate({ text: event.target.value } as Partial<EditorElement>)}
          onBlur={onFinishTextEditing}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <div
          className={`rendered-text ${element.text ? "" : "is-empty"}`}
          title="Click again to edit text"
          style={{ color: element.color, fontFamily: element.fontFamily, fontSize: element.fontSize * zoom, fontWeight: element.bold ? 700 : 400, textAlign: element.align }}
        >
          {element.text || "Click again to type"}
        </div>
      ))}
              {(element.type === "image" || element.type === "signature") && (
                // Data URLs are local editor content and cannot use Next.js image optimization.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={element.src} alt="" draggable={false} />
              )}
      {element.type === "draw" && (
        <svg viewBox={`0 0 ${element.width} ${element.height}`} preserveAspectRatio="none">
          <polyline points={element.points.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {(element.type === "highlight" || element.type === "redact") && <span style={{ background: element.color }} />}
      {selected && !editing && (
        <button
          className="resize-handle"
          aria-label="Resize element"
          onPointerDown={(event) => {
            event.stopPropagation();
            resizeRef.current = {
              pointerX: event.clientX,
              pointerY: event.clientY,
              width: element.width,
              height: element.height,
              started: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!resizeRef.current) return;
            if (!resizeRef.current.started) {
              resizeRef.current.started = true;
              onBeginMutation();
            }
            onUpdate({
              width: clamp(resizeRef.current.width + (event.clientX - resizeRef.current.pointerX) / zoom, 12, pageWidth - element.x),
              height: clamp(resizeRef.current.height + (event.clientY - resizeRef.current.pointerY) / zoom, 12, pageHeight - element.y),
            } as Partial<EditorElement>);
          }}
          onPointerUp={() => { resizeRef.current = null; }}
        />
      )}
    </div>
  );
}
