"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type {
  EditorElement,
  EditorPage,
  EditorTool,
  LineElement,
  Point,
  SpaceBand,
} from "@/types/editor";
import {
  basePageDisplaySize,
  clamp,
  lineGeometry,
  orderedSpaces,
  pageDisplaySize,
  snapLineEndpoint,
  spaceVisualTop,
} from "@/lib/editor-utils";
import type { LineGeometry } from "@/lib/editor-utils";

const GUIDE_STEP = 6;
const GUIDE_MAJOR_STEP = 24;

const snapGuideValue = (value: number) => Math.round(value / GUIDE_STEP) * GUIDE_STEP;

const snapGuideValueWithin = (value: number, minimum: number, maximum: number) => {
  const lowerGuide = Math.ceil(minimum / GUIDE_STEP) * GUIDE_STEP;
  const upperGuide = Math.floor(maximum / GUIDE_STEP) * GUIDE_STEP;
  if (lowerGuide > upperGuide) return clamp(value, minimum, maximum);
  return clamp(snapGuideValue(value), lowerGuide, upperGuide);
};

const snapGuidePoint = (point: Point, width: number, height: number): Point => ({
  x: snapGuideValueWithin(point.x, 0, width),
  y: snapGuideValueWithin(point.y, 0, height),
});

interface PdfPageProps {
  document: PDFDocumentProxy;
  page: EditorPage;
  pageNumber: number;
  zoom: number;
  tool: EditorTool;
  guidesEnabled: boolean;
  elements: EditorElement[];
  selectedElementId: string | null;
  selectedSpaceId: string | null;
  editingTextId: string | null;
  onActivate: () => void;
  onSelectElement: (id: string | null) => void;
  onSelectSpace: (id: string) => void;
  onStartTextEditing: (id: string) => void;
  onFinishTextEditing: () => void;
  onBeginMutation: () => void;
  onUpdate: (id: string, patch: Partial<EditorElement>) => void;
  onResizeSpace: (id: string, height: number) => void;
  onPlace: (point: Point) => void;
  onLine: (line: LineGeometry) => void;
  onDraw: (drawing: { x: number; y: number; width: number; height: number; points: Point[] }) => void;
}

export default function PdfPage({
  document,
  page,
  pageNumber,
  zoom,
  tool,
  guidesEnabled,
  elements,
  selectedElementId,
  selectedSpaceId,
  editingTextId,
  onActivate,
  onSelectElement,
  onSelectSpace,
  onStartTextEditing,
  onFinishTextEditing,
  onBeginMutation,
  onUpdate,
  onResizeSpace,
  onPlace,
  onLine,
  onDraw,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRenderRef = useRef<{
    canvas: HTMLCanvasElement;
    viewportWidth: number;
    viewportHeight: number;
    outputScale: number;
  } | null>(null);
  const [sourceRenderVersion, setSourceRenderVersion] = useState(0);
  const [draft, setDraft] = useState<Point[] | null>(null);
  const [lineDraft, setLineDraft] = useState<{ start: Point; end: Point } | null>(null);
  const [guidePoint, setGuidePoint] = useState<Point | null>(null);
  const [pixelRatio, setPixelRatio] = useState(() =>
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  );
  const draftRef = useRef<Point[] | null>(null);
  const lineDraftRef = useRef<{ start: Point; end: Point } | null>(null);
  const totalRotation = page.originalRotation + page.rotation;
  const baseSize = basePageDisplaySize(page);
  const size = pageDisplaySize(page);

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
    sourceRenderRef.current = null;
    void document.getPage(page.sourceIndex + 1).then(async (pdfPage) => {
      if (!active) return;
      const viewport = pdfPage.getViewport({ scale: zoom, rotation: totalRotation });
      const sourceCanvas = window.document.createElement("canvas");
      const desiredOutputScale = Math.max(2, pixelRatio);
      const maxCanvasPixels = 12_000_000;
      const scaleForPixelLimit = Math.sqrt(
        maxCanvasPixels / Math.max(1, viewport.width * viewport.height),
      );
      const outputScale = Math.min(desiredOutputScale, scaleForPixelLimit);

      sourceCanvas.width = Math.max(1, Math.ceil(viewport.width * outputScale));
      sourceCanvas.height = Math.max(1, Math.ceil(viewport.height * outputScale));
      const sourceContext = sourceCanvas.getContext("2d", { alpha: false });
      if (!sourceContext) return;
      sourceContext.imageSmoothingEnabled = false;
      task = pdfPage.render({
        canvas: sourceCanvas,
        canvasContext: sourceContext,
        viewport,
        transform: [outputScale, 0, 0, outputScale, 0, 0],
      });
      await task.promise;
      if (!active) return;
      sourceRenderRef.current = {
        canvas: sourceCanvas,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        outputScale,
      };
      setSourceRenderVersion((version) => version + 1);
    }).catch((error: unknown) => {
      if (active && !(error instanceof Error && error.name === "RenderingCancelledException")) console.error(error);
    });
    return () => { active = false; task?.cancel(); };
  }, [document, page.sourceIndex, pixelRatio, totalRotation, zoom]);

  useEffect(() => {
    const source = sourceRenderRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas) return;
    const cssWidth = size.width * zoom;
    const cssHeight = size.height * zoom;
    const maxCanvasPixels = 12_000_000;
    const scaleForPixelLimit = Math.sqrt(
      maxCanvasPixels / Math.max(1, cssWidth * cssHeight),
    );
    const outputScale = Math.min(source.outputScale, scaleForPixelLimit);

    canvas.width = Math.max(1, Math.ceil(cssWidth * outputScale));
    canvas.height = Math.max(1, Math.ceil(cssHeight * outputScale));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.dataset.outputScale = outputScale.toFixed(2);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const sourceScaleY = source.canvas.height / source.viewportHeight;
    const destinationScaleY = canvas.height / cssHeight;
    let sourceStart = 0;
    let offset = 0;

    const drawStrip = (sourceEnd: number) => {
      const stripHeight = Math.max(0, sourceEnd - sourceStart);
      if (stripHeight > 0) {
        context.drawImage(
          source.canvas,
          0,
          sourceStart * zoom * sourceScaleY,
          source.canvas.width,
          stripHeight * zoom * sourceScaleY,
          0,
          (sourceStart + offset) * zoom * destinationScaleY,
          canvas.width,
          stripHeight * zoom * destinationScaleY,
        );
      }
      sourceStart = sourceEnd;
    };

    for (const space of orderedSpaces(page)) {
      drawStrip(clamp(space.sourceY, sourceStart, baseSize.height));
      offset += space.height;
    }
    drawStrip(baseSize.height);
  }, [baseSize.height, page, size.height, size.width, sourceRenderVersion, zoom]);

  const relativePoint = (
    event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
  ): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / zoom, 0, size.width),
      y: clamp((event.clientY - rect.top) / zoom, 0, size.height),
    };
  };

  const guidedPoint = (
    event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
  ) => {
    const point = relativePoint(event);
    if (!guidesEnabled || event.altKey) return point;
    return snapGuidePoint(point, size.width, size.height);
  };

  const guidedPlacementPoint = (
    event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
  ) => {
    const point = relativePoint(event);
    if (!guidesEnabled || event.altKey) return point;
    const dimensions = tool === "text"
      ? { width: 190, height: 52 }
      : tool === "highlight" || tool === "redact"
        ? { width: 160, height: 32 }
        : { width: 0, height: 0 };
    return {
      x: snapGuideValueWithin(point.x, 0, Math.max(0, size.width - dimensions.width)),
      y: snapGuideValueWithin(point.y, 0, Math.max(0, size.height - dimensions.height)),
    };
  };

  const guidedLineEndpoint = (
    start: Point,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    let end = snapLineEndpoint(start, relativePoint(event));
    if (guidesEnabled && !event.altKey) {
      end = snapGuidePoint(end, size.width, size.height);
    }
    return end;
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
          } else if (tool === "line") {
            const first = guidedPoint(event);
            lineDraftRef.current = { start: first, end: first };
            setLineDraft(lineDraftRef.current);
            event.currentTarget.setPointerCapture(event.pointerId);
          } else if (tool === "select") {
            onSelectElement(null);
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget && event.target !== canvasRef.current) return;
          if (tool === "space" || tool === "text" || tool === "highlight" || tool === "redact") {
            onActivate();
            onPlace(tool === "space" ? relativePoint(event) : guidedPlacementPoint(event));
          }
        }}
        onPointerMove={(event) => {
          if (guidesEnabled) {
            setGuidePoint(
              tool === "text" || tool === "highlight" || tool === "redact"
                ? guidedPlacementPoint(event)
                : guidedPoint(event),
            );
          }
          if (tool === "line" && lineDraftRef.current) {
            const end = guidedLineEndpoint(lineDraftRef.current.start, event);
            if (guidesEnabled) setGuidePoint(end);
            lineDraftRef.current = {
              start: lineDraftRef.current.start,
              end,
            };
            setLineDraft(lineDraftRef.current);
            return;
          }
          if (tool !== "draw" || !draftRef.current) return;
          const next = relativePoint(event);
          const previous = draftRef.current[draftRef.current.length - 1];
          if (Math.hypot(next.x - previous.x, next.y - previous.y) < 1.5) return;
          draftRef.current = [...draftRef.current, next];
          setDraft(draftRef.current);
        }}
        onPointerUp={(event) => {
          if (lineDraftRef.current) {
            const start = lineDraftRef.current.start;
            const end = guidedLineEndpoint(start, event);
            if (guidesEnabled) setGuidePoint(end);
            if (Math.hypot(end.x - start.x, end.y - start.y) >= 2) {
              onLine(lineGeometry(start, end, size.width, size.height));
            }
            lineDraftRef.current = null;
            setLineDraft(null);
            return;
          }
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
        onPointerCancel={() => {
          draftRef.current = null;
          lineDraftRef.current = null;
          setDraft(null);
          setLineDraft(null);
          setGuidePoint(null);
        }}
        onPointerLeave={() => setGuidePoint(null)}
      >
        <canvas ref={canvasRef} className="pdf-canvas" />
        {guidesEnabled && (
          <AlignmentGuideLayer
            width={size.width}
            height={size.height}
            zoom={zoom}
            point={editingTextId ? null : guidePoint}
          />
        )}
        <div className="space-layer">
          {orderedSpaces(page).map((space) => (
            <SpaceBandControl
              key={space.id}
              space={space}
              top={spaceVisualTop(page, space)}
              zoom={zoom}
              selected={selectedSpaceId === space.id}
              enabled={tool === "select" || tool === "space"}
              onSelect={() => onSelectSpace(space.id)}
              onBeginMutation={onBeginMutation}
              onResize={(height) => onResizeSpace(space.id, height)}
            />
          ))}
        </div>
        <div className="elements-layer">
          {elements.map((element) => (
            <EditableElement
              key={element.id}
              element={element}
              zoom={zoom}
              selected={selectedElementId === element.id}
              editing={editingTextId === element.id}
              pageWidth={size.width}
              pageHeight={size.height}
              enabled={tool === "select"}
              snapToGuides={guidesEnabled}
              onGuidePoint={setGuidePoint}
              onSelect={() => onSelectElement(element.id)}
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
          {lineDraft && (
            <svg className="draft-path" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
              <line
                x1={lineDraft.start.x}
                y1={lineDraft.start.y}
                x2={lineDraft.end.x}
                y2={lineDraft.end.y}
                stroke="#2f6f55"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </div>
      <span className="page-stage-label">Page {pageNumber}</span>
    </section>
  );
}

function AlignmentGuideLayer({
  width,
  height,
  zoom,
  point,
}: {
  width: number;
  height: number;
  zoom: number;
  point: Point | null;
}) {
  const labelStep = zoom < 0.75 ? 96 : 48;
  const horizontalLabels = Array.from(
    { length: Math.floor(width / labelStep) + 1 },
    (_, index) => index * labelStep,
  );
  const verticalLabels = Array.from(
    { length: Math.floor(height / labelStep) + 1 },
    (_, index) => index * labelStep,
  );
  const renderedWidth = width * zoom;
  const renderedHeight = height * zoom;
  const labelLeft = point
    ? clamp(point.x * zoom + 9, 22, Math.max(22, renderedWidth - 112))
    : 0;
  const labelTop = point
    ? clamp(point.y * zoom + 9, 22, Math.max(22, renderedHeight - 30))
    : 0;

  return (
    <>
      <div
        className={`alignment-grid-layer ${zoom < 0.75 ? "hide-minor" : ""}`}
        aria-hidden="true"
      >
        <span
          className="alignment-grid-minor"
          style={{ backgroundSize: `${GUIDE_STEP * zoom}px ${GUIDE_STEP * zoom}px` }}
        />
        <span
          className="alignment-grid-major"
          style={{ backgroundSize: `${GUIDE_MAJOR_STEP * zoom}px ${GUIDE_MAJOR_STEP * zoom}px` }}
        />
      </div>
      <div
        className="alignment-ruler alignment-ruler-horizontal"
        style={{ backgroundSize: `${GUIDE_STEP * zoom}px 100%` }}
        aria-hidden="true"
      >
        {horizontalLabels.map((value) => (
          <span key={value} style={{ left: value * zoom }}>{value}</span>
        ))}
      </div>
      <div
        className="alignment-ruler alignment-ruler-vertical"
        style={{ backgroundSize: `100% ${GUIDE_STEP * zoom}px` }}
        aria-hidden="true"
      >
        {verticalLabels.map((value) => (
          <span key={value} style={{ top: value * zoom }}>{value}</span>
        ))}
      </div>
      {point && (
        <div className="alignment-cursor-layer" aria-hidden="true">
          <span className="alignment-crosshair is-vertical" style={{ left: point.x * zoom }} />
          <span className="alignment-crosshair is-horizontal" style={{ top: point.y * zoom }} />
          <span className="alignment-coordinate" style={{ left: labelLeft, top: labelTop }}>
            x {Math.round(point.x)} · y {Math.round(point.y)} pt
          </span>
        </div>
      )}
    </>
  );
}

interface SpaceBandControlProps {
  space: SpaceBand;
  top: number;
  zoom: number;
  selected: boolean;
  enabled: boolean;
  onSelect: () => void;
  onBeginMutation: () => void;
  onResize: (height: number) => void;
}

function SpaceBandControl({
  space,
  top,
  zoom,
  selected,
  enabled,
  onSelect,
  onBeginMutation,
  onResize,
}: SpaceBandControlProps) {
  const resizeRef = useRef<{
    pointerY: number;
    height: number;
    started: boolean;
  } | null>(null);

  return (
    <div
      className={`space-band ${selected ? "is-selected" : ""}`}
      style={{
        top: top * zoom,
        height: space.height * zoom,
        pointerEvents: enabled ? "auto" : "none",
      }}
      onPointerDown={(event) => {
        if (!enabled) return;
        event.stopPropagation();
        onSelect();
      }}
    >
      {selected && <span className="space-band-label">Space · {Math.round(space.height)} pt</span>}
      {selected && (
        <button
          className="space-resize-handle"
          aria-label="Resize blank space"
          onPointerDown={(event) => {
            event.stopPropagation();
            resizeRef.current = {
              pointerY: event.clientY,
              height: space.height,
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
            onResize(
              Math.max(24, resizeRef.current.height + (event.clientY - resizeRef.current.pointerY) / zoom),
            );
          }}
          onPointerUp={() => { resizeRef.current = null; }}
          onPointerCancel={() => { resizeRef.current = null; }}
        />
      )}
    </div>
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
  snapToGuides: boolean;
  onGuidePoint: (point: Point) => void;
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
  snapToGuides,
  onGuidePoint,
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
    lineStart?: Point;
    lineEnd?: Point;
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
        pointerEvents: element.type === "line"
          ? "none"
          : enabled || editing ? "auto" : "none",
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
          lineStart: element.type === "line"
            ? {
                x: element.x + element.start.x * element.width,
                y: element.y + element.start.y * element.height,
              }
            : undefined,
          lineEnd: element.type === "line"
            ? {
                x: element.x + element.end.x * element.width,
                y: element.y + element.end.y * element.height,
              }
            : undefined,
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
        const deltaX = (event.clientX - dragRef.current.pointerX) / zoom;
        const deltaY = (event.clientY - dragRef.current.pointerY) / zoom;
        if (element.type === "line" && dragRef.current.lineStart && dragRef.current.lineEnd) {
          const start = dragRef.current.lineStart;
          const end = dragRef.current.lineEnd;
          const minimumStartX = start.x - Math.min(start.x, end.x);
          const maximumStartX = start.x + pageWidth - Math.max(start.x, end.x);
          const minimumStartY = start.y - Math.min(start.y, end.y);
          const maximumStartY = start.y + pageHeight - Math.max(start.y, end.y);
          const requestedStartX = start.x + deltaX;
          const requestedStartY = start.y + deltaY;
          const nextStart = {
            x: snapToGuides && !event.altKey
              ? snapGuideValueWithin(requestedStartX, minimumStartX, maximumStartX)
              : clamp(requestedStartX, minimumStartX, maximumStartX),
            y: snapToGuides && !event.altKey
              ? snapGuideValueWithin(requestedStartY, minimumStartY, maximumStartY)
              : clamp(requestedStartY, minimumStartY, maximumStartY),
          };
          const translatedEnd = {
            x: end.x + nextStart.x - start.x,
            y: end.y + nextStart.y - start.y,
          };
          onUpdate(lineGeometry(nextStart, translatedEnd, pageWidth, pageHeight) as Partial<EditorElement>);
          return;
        }
        const maximumX = Math.max(0, pageWidth - element.width);
        const maximumY = Math.max(0, pageHeight - element.height);
        const requestedX = dragRef.current.x + deltaX;
        const requestedY = dragRef.current.y + deltaY;
        onUpdate({
          x: snapToGuides && !event.altKey
            ? snapGuideValueWithin(requestedX, 0, maximumX)
            : clamp(requestedX, 0, maximumX),
          y: snapToGuides && !event.altKey
            ? snapGuideValueWithin(requestedY, 0, maximumY)
            : clamp(requestedY, 0, maximumY),
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
      {element.type === "line" && (
        <LineContent element={element} zoom={zoom} enabled={enabled} />
      )}
      {(element.type === "highlight" || element.type === "redact") && <span style={{ background: element.color }} />}
      {selected && !editing && element.type === "line" && (
        <>
          <LineEndpointHandle
            endpoint="start"
            element={element}
            zoom={zoom}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            snapToGuides={snapToGuides}
            onGuidePoint={onGuidePoint}
            onBeginMutation={onBeginMutation}
            onUpdate={onUpdate}
          />
          <LineEndpointHandle
            endpoint="end"
            element={element}
            zoom={zoom}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            snapToGuides={snapToGuides}
            onGuidePoint={onGuidePoint}
            onBeginMutation={onBeginMutation}
            onUpdate={onUpdate}
          />
        </>
      )}
      {selected && !editing && element.type !== "line" && (
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

function LineContent({
  element,
  zoom,
  enabled,
}: {
  element: LineElement;
  zoom: number;
  enabled: boolean;
}) {
  const start = {
    x: element.start.x * element.width,
    y: element.start.y * element.height,
  };
  const end = {
    x: element.end.x * element.width,
    y: element.end.y * element.height,
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  return (
    <>
      <svg
        className="line-element-svg"
        viewBox={`0 0 ${element.width} ${element.height}`}
        preserveAspectRatio="none"
      >
        <line
          className="line-visible-stroke"
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={element.color}
          strokeWidth={Math.max(0.1, element.strokeWidth) * zoom}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <button
        type="button"
        className="line-selection-target"
        aria-label="Select and move line"
        style={{
          left: start.x * zoom,
          top: start.y * zoom,
          width: Math.max(14, length * zoom),
          transform: `translateY(-50%) rotate(${angle}deg)`,
          pointerEvents: enabled ? "auto" : "none",
        }}
      />
    </>
  );
}

interface LineEndpointHandleProps {
  endpoint: "start" | "end";
  element: LineElement;
  zoom: number;
  pageWidth: number;
  pageHeight: number;
  snapToGuides: boolean;
  onGuidePoint: (point: Point) => void;
  onBeginMutation: () => void;
  onUpdate: (patch: Partial<EditorElement>) => void;
}

function LineEndpointHandle({
  endpoint,
  element,
  zoom,
  pageWidth,
  pageHeight,
  snapToGuides,
  onGuidePoint,
  onBeginMutation,
  onUpdate,
}: LineEndpointHandleProps) {
  const interactionRef = useRef<{
    pointerX: number;
    pointerY: number;
    moving: Point;
    fixed: Point;
    started: boolean;
  } | null>(null);
  const point = element[endpoint];

  return (
    <button
      className="line-endpoint-handle"
      aria-label={`Move ${endpoint} of line`}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      onPointerDown={(event) => {
        event.stopPropagation();
        const start = {
          x: element.x + element.start.x * element.width,
          y: element.y + element.start.y * element.height,
        };
        const end = {
          x: element.x + element.end.x * element.width,
          y: element.y + element.end.y * element.height,
        };
        interactionRef.current = {
          pointerX: event.clientX,
          pointerY: event.clientY,
          moving: endpoint === "start" ? start : end,
          fixed: endpoint === "start" ? end : start,
          started: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const interaction = interactionRef.current;
        if (!interaction) return;
        event.stopPropagation();
        if (!interaction.started) {
          interaction.started = true;
          onBeginMutation();
        }
        const candidate = {
          x: clamp(
            interaction.moving.x + (event.clientX - interaction.pointerX) / zoom,
            0,
            pageWidth,
          ),
          y: clamp(
            interaction.moving.y + (event.clientY - interaction.pointerY) / zoom,
            0,
            pageHeight,
          ),
        };
        let moving = snapLineEndpoint(interaction.fixed, candidate);
        if (snapToGuides && !event.altKey) {
          moving = snapGuidePoint(moving, pageWidth, pageHeight);
        }
        if (snapToGuides) onGuidePoint(moving);
        onUpdate(
          (endpoint === "start"
            ? lineGeometry(moving, interaction.fixed, pageWidth, pageHeight)
            : lineGeometry(interaction.fixed, moving, pageWidth, pageHeight)) as Partial<EditorElement>,
        );
      }}
      onPointerUp={() => { interactionRef.current = null; }}
      onPointerCancel={() => { interactionRef.current = null; }}
    />
  );
}
