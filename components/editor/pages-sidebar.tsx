"use client";

import { useEffect, useRef } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { ChevronDown, ChevronUp, Copy, FilePlus2, RotateCw, Trash2 } from "lucide-react";
import type { EditorPage } from "@/types/editor";

function PageThumbnail({ document, page }: { document: PDFDocumentProxy; page: EditorPage }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    let task: RenderTask | undefined;
    void document.getPage(page.sourceIndex + 1).then((pdfPage) => {
      if (!active || !canvasRef.current) return;
      const viewport = pdfPage.getViewport({
        scale: 0.22,
        rotation: page.originalRotation + page.rotation,
      });
      const canvas = canvasRef.current;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = viewport.width * ratio;
      canvas.height = viewport.height * ratio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      task = pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      return task.promise;
    }).catch((error: unknown) => {
      if (active && !(error instanceof Error && error.name === "RenderingCancelledException")) console.error(error);
    });
    return () => { active = false; task?.cancel(); };
  }, [document, page]);

  return <canvas ref={canvasRef} />;
}

interface PagesSidebarProps {
  document: PDFDocumentProxy;
  pages: EditorPage[];
  activePageId: string;
  onSelect: (pageId: string) => void;
  onMove: (pageId: string, direction: -1 | 1) => void;
  onRotate: (pageId: string) => void;
  onDuplicate: (pageId: string) => void;
  onDelete: (pageId: string) => void;
}

export default function PagesSidebar({
  document,
  pages,
  activePageId,
  onSelect,
  onMove,
  onRotate,
  onDuplicate,
  onDelete,
}: PagesSidebarProps) {
  return (
    <aside className="pages-panel">
      <div className="pages-heading">
        <div><span className="panel-kicker">Document</span><h2>Pages <b>{pages.length}</b></h2></div>
        <button className="icon-button" title="Add another PDF (coming soon)" disabled><FilePlus2 size={18} /></button>
      </div>
      <div className="page-list">
        {pages.map((page, index) => (
          <article
            key={page.id}
            className={`page-list-item ${activePageId === page.id ? "is-active" : ""}`}
            onClick={() => onSelect(page.id)}
          >
            <div className="thumbnail-wrap">
              <PageThumbnail document={document} page={page} />
              <span className="page-number">{index + 1}</span>
            </div>
            <div className="page-item-actions">
              <button disabled={index === 0} onClick={(event) => { event.stopPropagation(); onMove(page.id, -1); }} title="Move page up"><ChevronUp size={14} /></button>
              <button disabled={index === pages.length - 1} onClick={(event) => { event.stopPropagation(); onMove(page.id, 1); }} title="Move page down"><ChevronDown size={14} /></button>
              <button onClick={(event) => { event.stopPropagation(); onRotate(page.id); }} title="Rotate page"><RotateCw size={14} /></button>
              <button onClick={(event) => { event.stopPropagation(); onDuplicate(page.id); }} title="Duplicate page"><Copy size={14} /></button>
              <button disabled={pages.length === 1} onClick={(event) => { event.stopPropagation(); onDelete(page.id); }} title="Delete page"><Trash2 size={14} /></button>
            </div>
          </article>
        ))}
      </div>
      <p className="pages-help">Use the arrows to reorder pages. Every action can be undone.</p>
    </aside>
  );
}
