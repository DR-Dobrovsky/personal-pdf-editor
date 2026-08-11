"use client";

import { useRef } from "react";
import {
  Download,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  ScanLine,
  Signature,
  Type,
  Undo2,
} from "lucide-react";
import type { EditorTool } from "@/types/editor";

interface EditorToolbarProps {
  tool: EditorTool;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  exporting: boolean;
  onTool: (tool: EditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoom: (zoom: number) => void;
  onImage: (file: File) => void;
  onSignature: () => void;
  onExport: () => void;
}

const TOOLS = [
  { id: "select" as const, label: "Select", icon: MousePointer2 },
  { id: "space" as const, label: "Space", icon: Minus },
  { id: "text" as const, label: "Text", icon: Type },
  { id: "draw" as const, label: "Draw", icon: PenLine },
  { id: "highlight" as const, label: "Highlight", icon: Highlighter },
  { id: "redact" as const, label: "Redact", icon: ScanLine },
];

export default function EditorToolbar({
  tool,
  zoom,
  canUndo,
  canRedo,
  exporting,
  onTool,
  onUndo,
  onRedo,
  onZoom,
  onImage,
  onSignature,
  onExport,
}: EditorToolbarProps) {
  const imageInput = useRef<HTMLInputElement>(null);

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="PDF editing tools">
      <div className="toolbar-group toolbar-tools">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`tool-button ${tool === id ? "is-active" : ""}`}
            title={label}
            aria-label={label}
            aria-pressed={tool === id}
            onClick={() => onTool(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
        <span className="toolbar-divider" />
        <button className="tool-button" title="Add image" onClick={() => imageInput.current?.click()}>
          <ImagePlus size={18} /><span>Image</span>
        </button>
        <input
          ref={imageInput}
          hidden
          type="file"
          accept="image/png,image/jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImage(file);
            event.target.value = "";
          }}
        />
        <button className="tool-button" title="Add signature" onClick={onSignature}>
          <Signature size={18} /><span>Sign</span>
        </button>
      </div>

      <div className="toolbar-group toolbar-actions">
        <button className="icon-button" disabled={!canUndo} onClick={onUndo} title="Undo (Ctrl+Z)"><Undo2 size={18} /></button>
        <button className="icon-button" disabled={!canRedo} onClick={onRedo} title="Redo (Ctrl+Shift+Z)"><Redo2 size={18} /></button>
        <span className="toolbar-divider" />
        <div className="zoom-control">
          <button onClick={() => onZoom(Math.max(0.5, zoom - 0.1))} aria-label="Zoom out"><Minus size={16} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => onZoom(Math.min(2, zoom + 0.1))} aria-label="Zoom in"><Plus size={16} /></button>
        </div>
        <button className="primary-button export-button" disabled={exporting} onClick={onExport}>
          {exporting ? <span className="spinner spinner-light" /> : <Download size={17} />}
          <span>{exporting ? "Exporting…" : "Export PDF"}</span>
        </button>
      </div>
    </div>
  );
}
