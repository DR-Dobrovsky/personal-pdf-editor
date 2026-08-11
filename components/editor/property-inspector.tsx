"use client";

import { AlignCenter, AlignLeft, AlignRight, Copy, Trash2 } from "lucide-react";
import type { EditorElement } from "@/types/editor";

interface PropertyInspectorProps {
  element?: EditorElement;
  onBeginChange: () => void;
  onChange: (patch: Partial<EditorElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export default function PropertyInspector({
  element,
  onBeginChange,
  onChange,
  onDelete,
  onDuplicate,
}: PropertyInspectorProps) {
  if (!element) {
    return (
      <aside className="inspector-panel inspector-empty">
        <div className="inspector-empty-icon">✦</div>
        <h3>Nothing selected</h3>
        <p>Choose an item on the page to adjust its appearance and size.</p>
      </aside>
    );
  }

  const fieldChange = (patch: Partial<EditorElement>) => {
    onBeginChange();
    onChange(patch);
  };

  return (
    <aside className="inspector-panel">
      <div className="panel-title-row">
        <div>
          <span className="panel-kicker">Selected</span>
          <h3>{element.type === "signature" ? "Signature" : `${element.type[0].toUpperCase()}${element.type.slice(1)}`}</h3>
        </div>
        <div className="mini-actions">
          <button onClick={onDuplicate} title="Duplicate"><Copy size={16} /></button>
          <button className="danger-icon" onClick={onDelete} title="Delete"><Trash2 size={16} /></button>
        </div>
      </div>

      {element.type === "text" && (
        <>
          <label className="field-label">Text</label>
          <textarea
            className="property-textarea"
            value={element.text}
            onFocus={onBeginChange}
            onChange={(event) => onChange({ text: event.target.value } as Partial<EditorElement>)}
          />
          <div className="field-grid">
            <label>
              <span>Font</span>
              <select value={element.fontFamily} onChange={(event) => fieldChange({ fontFamily: event.target.value } as Partial<EditorElement>)}>
                <option>Helvetica</option><option>Times Roman</option><option>Courier</option>
              </select>
            </label>
            <label>
              <span>Size</span>
              <input type="number" min={6} max={96} value={element.fontSize} onChange={(event) => fieldChange({ fontSize: Number(event.target.value) } as Partial<EditorElement>)} />
            </label>
          </div>
          <div className="field-row">
            <label className="color-field"><span>Color</span><input type="color" value={element.color} onChange={(event) => fieldChange({ color: event.target.value } as Partial<EditorElement>)} /></label>
            <button className={`toggle-button ${element.bold ? "is-active" : ""}`} onClick={() => fieldChange({ bold: !element.bold } as Partial<EditorElement>)}>B</button>
            <div className="segmented-buttons">
              {([AlignLeft, AlignCenter, AlignRight] as const).map((Icon, index) => {
                const align = (["left", "center", "right"] as const)[index];
                return <button key={align} className={element.align === align ? "is-active" : ""} onClick={() => fieldChange({ align } as Partial<EditorElement>)}><Icon size={15} /></button>;
              })}
            </div>
          </div>
        </>
      )}

      {element.type === "draw" && (
        <div className="field-grid">
          <label className="color-field"><span>Ink</span><input type="color" value={element.color} onChange={(event) => fieldChange({ color: event.target.value } as Partial<EditorElement>)} /></label>
          <label><span>Width</span><input type="number" min={1} max={20} value={element.strokeWidth} onChange={(event) => fieldChange({ strokeWidth: Number(event.target.value) } as Partial<EditorElement>)} /></label>
        </div>
      )}

      {(element.type === "highlight" || element.type === "redact") && (
        <label className="color-field full-field"><span>Fill color</span><input type="color" value={element.color} onChange={(event) => fieldChange({ color: event.target.value } as Partial<EditorElement>)} /></label>
      )}

      <label className="range-field">
        <span><span>Opacity</span><strong>{Math.round(element.opacity * 100)}%</strong></span>
        <input type="range" min={10} max={100} value={element.opacity * 100} onPointerDown={onBeginChange} onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 } as Partial<EditorElement>)} />
      </label>

      <div className="field-grid dimensions-grid">
        <label><span>Width</span><input type="number" min={8} value={Math.round(element.width)} onChange={(event) => fieldChange({ width: Number(event.target.value) } as Partial<EditorElement>)} /></label>
        <label><span>Height</span><input type="number" min={8} value={Math.round(element.height)} onChange={(event) => fieldChange({ height: Number(event.target.value) } as Partial<EditorElement>)} /></label>
      </div>

      <p className="inspector-tip">Tip: drag the corner handle to resize this item.</p>
    </aside>
  );
}
