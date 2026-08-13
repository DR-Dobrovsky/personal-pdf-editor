"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Copy, Scissors, Trash2 } from "lucide-react";
import { EDITOR_FONT_GROUPS, editorFont, isTextFontFamily } from "@/lib/editor-fonts";
import { lineMetrics } from "@/lib/editor-utils";
import type {
  EditorElement,
  LineElement,
  SpaceBand,
  TextElement,
} from "@/types/editor";

export type MultiAlignmentAction =
  | "left"
  | "horizontal-center"
  | "right"
  | "top"
  | "vertical-middle"
  | "bottom"
  | "baseline"
  | "distribute-horizontal"
  | "distribute-vertical";

interface PropertyInspectorProps {
  element?: EditorElement;
  elements?: EditorElement[];
  primaryId?: string;
  space?: SpaceBand;
  spaceTop?: number;
  onBeginChange: () => void;
  onChange: (patch: Partial<EditorElement>) => void;
  onLineMetricsChange: (angle: number, length: number) => void;
  onSpaceHeightChange: (height: number) => void;
  onAlign: (action: MultiAlignmentAction) => void;
  onDelete: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDuplicate: () => void;
}

const isMixed = (values: unknown[]) =>
  values.some((value) => value !== values[0]);

function FieldName({ children, mixed }: { children: React.ReactNode; mixed: boolean }) {
  return (
    <span>
      {children}
      {mixed && <em className="mixed-label">Mixed</em>}
    </span>
  );
}

export default function PropertyInspector({
  element,
  elements = [],
  primaryId,
  space,
  spaceTop,
  onBeginChange,
  onChange,
  onLineMetricsChange,
  onSpaceHeightChange,
  onAlign,
  onDelete,
  onCopy,
  onCut,
  onDuplicate,
}: PropertyInspectorProps) {
  if (elements.length > 1) {
    const primary = elements.find(({ id }) => id === primaryId) ?? elements.at(-1)!;
    const allText = elements.every(({ type }) => type === "text");
    const textElements = allText ? elements as TextElement[] : [];
    const primaryText = allText ? primary as TextElement : undefined;
    const supportsSharedBold = allText
      && textElements.every(({ fontFamily }) => editorFont(fontFamily).supportsBold);
    const opacityMixed = isMixed(elements.map(({ opacity }) => opacity));
    const fontFamilyMixed = allText && isMixed(textElements.map(({ fontFamily }) => fontFamily));
    const boldMixed = allText && isMixed(textElements.map(({ bold }) => bold));
    const textAlignMixed = allText && isMixed(textElements.map(({ align }) => align));
    const fieldChange = (patch: Partial<EditorElement>) => {
      onBeginChange();
      onChange(patch);
    };
    const alignmentButtons: Array<[MultiAlignmentAction, string, string]> = [
      ["left", "Left", "Align left edges to the primary element"],
      ["horizontal-center", "H center", "Align horizontal centers to the primary element"],
      ["right", "Right", "Align right edges to the primary element"],
      ["top", "Top", "Align top edges to the primary element"],
      ["vertical-middle", "V middle", "Align vertical centers to the primary element"],
      ["bottom", "Bottom", "Align bottom edges to the primary element"],
    ];

    return (
      <aside className="inspector-panel">
        <div className="panel-title-row">
          <div>
            <span className="panel-kicker">Selected</span>
            <h3>{elements.length} elements selected</h3>
          </div>
        </div>

        <div className="multi-action-grid" aria-label="Selection actions">
          <button type="button" onClick={onCopy} title="Copy selected elements" aria-label="Copy selected elements"><Copy size={15} />Copy</button>
          <button type="button" onClick={onCut} title="Cut selected elements" aria-label="Cut selected elements"><Scissors size={15} />Cut</button>
          <button type="button" onClick={onDuplicate} title="Duplicate selected elements" aria-label="Duplicate selected elements"><Copy size={15} />Duplicate</button>
          <button type="button" className="danger-icon" onClick={onDelete} title="Delete selected elements" aria-label="Delete selected elements"><Trash2 size={15} />Delete</button>
        </div>

        <label className="field-label">Align to primary</label>
        <div className="multi-alignment-grid" aria-label="Align selected elements to the primary element">
          {alignmentButtons.map(([action, label, title]) => (
            <button key={action} type="button" onClick={() => onAlign(action)} title={title} aria-label={title}>{label}</button>
          ))}
          {allText && (
            <button type="button" onClick={() => onAlign("baseline")} title="Align text baselines to the primary text element" aria-label="Align text baselines to the primary text element">Baseline</button>
          )}
        </div>

        {elements.length >= 3 && (
          <>
            <label className="field-label">Distribute with fixed outer items</label>
            <div className="multi-alignment-grid distribution-grid" aria-label="Distribute selected elements">
              <button type="button" onClick={() => onAlign("distribute-horizontal")} title="Distribute horizontally with equal gaps" aria-label="Distribute selected elements horizontally with equal gaps">Horizontal</button>
              <button type="button" onClick={() => onAlign("distribute-vertical")} title="Distribute vertically with equal gaps" aria-label="Distribute selected elements vertically with equal gaps">Vertical</button>
            </div>
          </>
        )}

        {primaryText && (
          <>
            <div className="field-grid">
              <label>
                <FieldName mixed={fontFamilyMixed}>Font</FieldName>
                <select
                  value={fontFamilyMixed ? "" : primaryText.fontFamily}
                  aria-label="Font for selected text elements"
                  onChange={(event) => {
                    if (isTextFontFamily(event.target.value)) {
                      const font = editorFont(event.target.value);
                      fieldChange({
                        fontFamily: event.target.value,
                        ...(font.supportsBold ? {} : { bold: false }),
                      } as Partial<EditorElement>);
                    }
                  }}
                >
                  {fontFamilyMixed && <option value="" disabled>Mixed — choose a font</option>}
                  {EDITOR_FONT_GROUPS.map((group) => (
                    <optgroup key={group.group} label={group.label}>
                      {group.fonts.map((font) => (
                        <option key={font.id} value={font.id}>{font.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                <FieldName mixed={isMixed(textElements.map(({ fontSize }) => fontSize))}>Size</FieldName>
                <input
                  type="number"
                  min={2}
                  max={96}
                  value={primaryText.fontSize}
                  aria-label="Font size for selected text elements"
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      fieldChange({ fontSize: Math.min(96, Math.max(2, value)) } as Partial<EditorElement>);
                    }
                  }}
                />
              </label>
            </div>
            {(boldMixed || textAlignMixed) && (
              <div className="multi-mixed-values" aria-live="polite">
                {boldMixed && <span className="mixed-label">Bold: Mixed</span>}
                {textAlignMixed && <span className="mixed-label">Text align: Mixed</span>}
              </div>
            )}
            <div className="field-row">
              <label className="color-field">
                <FieldName mixed={isMixed(textElements.map(({ color }) => color))}>Color</FieldName>
                <input
                  type="color"
                  value={primaryText.color}
                  aria-label="Color for selected text elements"
                  onChange={(event) => fieldChange({ color: event.target.value } as Partial<EditorElement>)}
                />
              </label>
              <button
                type="button"
                className={`toggle-button ${primaryText.bold ? "is-active" : ""}`}
                disabled={!supportsSharedBold}
                title={isMixed(textElements.map(({ bold }) => bold)) ? "Bold (Mixed)" : "Bold"}
                aria-label={isMixed(textElements.map(({ bold }) => bold)) ? "Bold selected text (Mixed)" : "Bold selected text"}
                onClick={() => fieldChange({ bold: !primaryText.bold } as Partial<EditorElement>)}
              >B{isMixed(textElements.map(({ bold }) => bold)) && <span className="mixed-dot" aria-hidden="true" />}</button>
              <div className="segmented-buttons" aria-label={isMixed(textElements.map(({ align }) => align)) ? "Text alignment (Mixed)" : "Text alignment"}>
                {([AlignLeft, AlignCenter, AlignRight] as const).map((Icon, index) => {
                  const align = (["left", "center", "right"] as const)[index];
                  return (
                    <button
                      type="button"
                      key={align}
                      className={primaryText.align === align ? "is-active" : ""}
                      title={`Align selected text ${align}${isMixed(textElements.map(({ align: value }) => value)) ? " (Mixed)" : ""}`}
                      aria-label={`Align selected text ${align}`}
                      onClick={() => fieldChange({ align } as Partial<EditorElement>)}
                    ><Icon size={15} /></button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <label className="range-field">
          <span>
            <FieldName mixed={opacityMixed}>Opacity</FieldName>
            <strong>{Math.round(primary.opacity * 100)}%</strong>
          </span>
          <input
            type="range"
            min={10}
            max={100}
            value={primary.opacity * 100}
            aria-label={opacityMixed ? "Opacity for selected elements (Mixed)" : "Opacity for selected elements"}
            onPointerDown={onBeginChange}
            onKeyDown={(event) => {
              if (event.key.startsWith("Arrow")) onBeginChange();
            }}
            onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 } as Partial<EditorElement>)}
          />
        </label>

        <p className="inspector-tip">Shift/Ctrl/Cmd-click toggles items. Drag blank canvas to marquee-select. The last selected item is the primary reference and remains fixed during alignment.</p>
      </aside>
    );
  }

  if (!element && !space) {
    return (
      <aside className="inspector-panel inspector-empty">
        <div className="inspector-empty-icon">✦</div>
        <h3>Nothing selected</h3>
        <p>Choose an item on the page to adjust its appearance and size.</p>
        <p className="inspector-tip">Shift/Ctrl/Cmd-click toggles items. Drag blank canvas to select with a marquee.</p>
      </aside>
    );
  }

  if (space) {
    return (
      <aside className="inspector-panel">
        <div className="panel-title-row">
          <div>
            <span className="panel-kicker">Selected</span>
            <h3>Blank space</h3>
          </div>
          <div className="mini-actions">
            <button type="button" onClick={onCopy} title="Copy blank space" aria-label="Copy blank space"><Copy size={16} /></button>
            <button type="button" className="danger-icon" onClick={onDelete} title="Delete blank space" aria-label="Delete blank space"><Trash2 size={16} /></button>
          </div>
        </div>

        <div className="space-inspector-preview" aria-hidden="true">
          <span />
          <strong>Blank area</strong>
          <span />
        </div>

        <div className="field-grid dimensions-grid">
          <label>
            <span>Position</span>
            <input type="number" value={Math.round(spaceTop ?? space.sourceY)} readOnly />
          </label>
          <label>
            <span>Height</span>
            <input
              type="number"
              min={24}
              value={Math.round(space.height)}
              onFocus={onBeginChange}
              onChange={(event) => onSpaceHeightChange(Number(event.target.value))}
            />
          </label>
        </div>

        <p className="inspector-tip">Drag the lower edge on the page to resize. Content below moves with it.</p>
      </aside>
    );
  }

  if (!element) return null;

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
          <button type="button" onClick={onDuplicate} title="Duplicate element" aria-label="Duplicate element"><Copy size={16} /></button>
          <button type="button" className="danger-icon" onClick={onDelete} title="Delete element" aria-label="Delete element"><Trash2 size={16} /></button>
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
              <select
                value={element.fontFamily}
                onChange={(event) => {
                  if (isTextFontFamily(event.target.value)) {
                    const font = editorFont(event.target.value);
                    fieldChange({
                      fontFamily: event.target.value,
                      ...(font.supportsBold ? {} : { bold: false }),
                    } as Partial<EditorElement>);
                  }
                }}
              >
                {EDITOR_FONT_GROUPS.map((group) => (
                  <optgroup key={group.group} label={group.label}>
                    {group.fonts.map((font) => (
                      <option key={font.id} value={font.id}>{font.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              <span>Size</span>
              <input
                type="number"
                min={2}
                max={96}
                value={element.fontSize}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) {
                    fieldChange({
                      fontSize: Math.min(96, Math.max(2, value)),
                    } as Partial<EditorElement>);
                  }
                }}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="color-field"><span>Color</span><input type="color" value={element.color} onChange={(event) => fieldChange({ color: event.target.value } as Partial<EditorElement>)} /></label>
            <button
              type="button"
              className={`toggle-button ${element.bold ? "is-active" : ""}`}
              disabled={!editorFont(element.fontFamily).supportsBold}
              title={editorFont(element.fontFamily).supportsBold
                ? "Bold"
                : "This is a fixed font face. Select a Bold or Bold Italic face from the font menu."}
              aria-label="Bold text"
              onClick={() => fieldChange({ bold: !element.bold } as Partial<EditorElement>)}
            >B</button>
            <div className="segmented-buttons">
              {([AlignLeft, AlignCenter, AlignRight] as const).map((Icon, index) => {
                const align = (["left", "center", "right"] as const)[index];
                return <button type="button" key={align} title={`Align text ${align}`} aria-label={`Align text ${align}`} className={element.align === align ? "is-active" : ""} onClick={() => fieldChange({ align } as Partial<EditorElement>)}><Icon size={15} /></button>;
              })}
            </div>
          </div>
        </>
      )}

      {(element.type === "draw" || element.type === "line") && (
        <div className="field-grid">
          <label className="color-field">
            <span>{element.type === "line" ? "Color" : "Ink"}</span>
            <input
              type="color"
              value={element.color}
              onChange={(event) => fieldChange({ color: event.target.value } as Partial<EditorElement>)}
            />
          </label>
          <label>
            <span>Thickness</span>
            <input
              type="number"
              min={element.type === "line" ? 0.1 : 1}
              max={20}
              step={element.type === "line" ? 0.1 : 1}
              value={element.strokeWidth}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) {
                  const minimum = element.type === "line" ? 0.1 : 1;
                  fieldChange({ strokeWidth: Math.min(20, Math.max(minimum, value)) } as Partial<EditorElement>);
                }
              }}
            />
          </label>
        </div>
      )}

      {element.type === "line" && (
        <LineMetricControls
          key={element.id}
          element={element}
          onBeginChange={onBeginChange}
          onChange={onLineMetricsChange}
        />
      )}

      {(element.type === "highlight" || element.type === "redact") && (
        <label className="color-field full-field"><span>Fill color</span><input type="color" value={element.color} onChange={(event) => fieldChange({ color: event.target.value } as Partial<EditorElement>)} /></label>
      )}

      <label className="range-field">
        <span><span>Opacity</span><strong>{Math.round(element.opacity * 100)}%</strong></span>
        <input type="range" min={10} max={100} value={element.opacity * 100} onPointerDown={onBeginChange} onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 } as Partial<EditorElement>)} />
      </label>

      {element.type !== "line" && (
        <div className="field-grid dimensions-grid">
          <label><span>Width</span><input type="number" min={8} value={Math.round(element.width)} onChange={(event) => fieldChange({ width: Number(event.target.value) } as Partial<EditorElement>)} /></label>
          <label><span>Height</span><input type="number" min={8} value={Math.round(element.height)} onChange={(event) => fieldChange({ height: Number(event.target.value) } as Partial<EditorElement>)} /></label>
        </div>
      )}

      <p className="inspector-tip">Appearance changes are remembered for the next new {element.type === "draw" ? "drawing" : element.type}.</p>

      <p className="inspector-tip">
        {element.type === "line"
          ? "Set an exact angle and length, use a straight preset, or drag an endpoint. Near-horizontal and near-vertical lines snap perfectly straight."
          : "Tip: drag the corner handle to resize this item."}
      </p>
    </aside>
  );
}

const formatMetric = (value: number) => String(Number(value.toFixed(1)));

function LineMetricControls({
  element,
  onBeginChange,
  onChange,
}: {
  element: LineElement;
  onBeginChange: () => void;
  onChange: (angle: number, length: number) => void;
}) {
  const metrics = lineMetrics(element);
  const [angleDraft, setAngleDraft] = useState<string | null>(null);
  const [lengthDraft, setLengthDraft] = useState<string | null>(null);

  const updateAngle = (value: string) => {
    setAngleDraft(value);
    if (!value.trim() || value.trim() === "-") return;
    const angle = Number(value);
    if (Number.isFinite(angle)) onChange(angle, metrics.length);
  };

  const updateLength = (value: string) => {
    setLengthDraft(value);
    if (!value.trim()) return;
    const length = Number(value);
    if (Number.isFinite(length) && length > 0) onChange(metrics.angle, length);
  };

  return (
    <>
      <div className="field-grid dimensions-grid">
        <label>
          <span>Angle (degrees)</span>
          <input
            type="text"
            inputMode="decimal"
            value={angleDraft ?? formatMetric(metrics.angle)}
            onFocus={() => {
              setAngleDraft(formatMetric(metrics.angle));
              onBeginChange();
            }}
            onChange={(event) => updateAngle(event.target.value)}
            onBlur={() => setAngleDraft(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setAngleDraft(null);
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <label>
          <span>Length</span>
          <input
            type="text"
            inputMode="decimal"
            value={lengthDraft ?? formatMetric(metrics.length)}
            onFocus={() => {
              setLengthDraft(formatMetric(metrics.length));
              onBeginChange();
            }}
            onChange={(event) => updateLength(event.target.value)}
            onBlur={() => setLengthDraft(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setLengthDraft(null);
                event.currentTarget.blur();
              }
            }}
          />
        </label>
      </div>
      <div className="line-angle-presets" aria-label="Perfectly straight line angles">
        <button
          type="button"
          onClick={() => { onBeginChange(); onChange(0, metrics.length); }}
        >
          Horizontal 0°
        </button>
        <button
          type="button"
          onClick={() => { onBeginChange(); onChange(90, metrics.length); }}
        >
          Vertical 90°
        </button>
      </div>
    </>
  );
}
