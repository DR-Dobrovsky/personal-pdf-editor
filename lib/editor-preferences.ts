import { isTextFontFamily } from "@/lib/editor-fonts";
import type { EditorElement, TextFontFamily } from "@/types/editor";

const STORAGE_KEY = "paperly.editor-style-preferences.v1";
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

type TextStylePreferences = {
  fontFamily: TextFontFamily;
  fontSize: number;
  color: string;
  bold: boolean;
  align: "left" | "center" | "right";
  opacity: number;
};

type StrokeStylePreferences = {
  color: string;
  strokeWidth: number;
  opacity: number;
};

type BlockStylePreferences = {
  color: string;
  opacity: number;
};

export interface EditorStylePreferences {
  text: TextStylePreferences;
  draw: StrokeStylePreferences;
  line: StrokeStylePreferences;
  highlight: BlockStylePreferences;
  redact: BlockStylePreferences;
  image: { opacity: number };
  signature: { opacity: number };
}

export const DEFAULT_EDITOR_STYLE_PREFERENCES: EditorStylePreferences = {
  text: {
    fontFamily: "Arial",
    fontSize: 18,
    color: "#17211b",
    bold: false,
    align: "left",
    opacity: 1,
  },
  draw: { color: "#2f6f55", strokeWidth: 2.5, opacity: 1 },
  line: { color: "#2f6f55", strokeWidth: 2.5, opacity: 1 },
  highlight: { color: "#f4d35e", opacity: 0.38 },
  redact: { color: "#17211b", opacity: 1 },
  image: { opacity: 1 },
  signature: { opacity: 1 },
};

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const finiteWithin = (value: unknown, fallback: number, minimum: number, maximum: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;

const color = (value: unknown, fallback: string) =>
  typeof value === "string" && COLOR_PATTERN.test(value) ? value : fallback;

const opacity = (value: unknown, fallback: number) =>
  finiteWithin(value, fallback, 0.1, 1);

export const parseEditorStylePreferences = (value: unknown): EditorStylePreferences => {
  const source = record(value);
  const text = record(source.text);
  const draw = record(source.draw);
  const line = record(source.line);
  const highlight = record(source.highlight);
  const redact = record(source.redact);
  const image = record(source.image);
  const signature = record(source.signature);
  const defaults = DEFAULT_EDITOR_STYLE_PREFERENCES;

  return {
    text: {
      fontFamily: isTextFontFamily(text.fontFamily)
        ? text.fontFamily
        : defaults.text.fontFamily,
      fontSize: finiteWithin(text.fontSize, defaults.text.fontSize, 2, 96),
      color: color(text.color, defaults.text.color),
      bold: typeof text.bold === "boolean" ? text.bold : defaults.text.bold,
      align: text.align === "left" || text.align === "center" || text.align === "right"
        ? text.align
        : defaults.text.align,
      opacity: opacity(text.opacity, defaults.text.opacity),
    },
    draw: {
      color: color(draw.color, defaults.draw.color),
      strokeWidth: finiteWithin(draw.strokeWidth, defaults.draw.strokeWidth, 1, 20),
      opacity: opacity(draw.opacity, defaults.draw.opacity),
    },
    line: {
      color: color(line.color, defaults.line.color),
      strokeWidth: finiteWithin(line.strokeWidth, defaults.line.strokeWidth, 0.1, 20),
      opacity: opacity(line.opacity, defaults.line.opacity),
    },
    highlight: {
      color: color(highlight.color, defaults.highlight.color),
      opacity: opacity(highlight.opacity, defaults.highlight.opacity),
    },
    redact: {
      color: color(redact.color, defaults.redact.color),
      opacity: opacity(redact.opacity, defaults.redact.opacity),
    },
    image: { opacity: opacity(image.opacity, defaults.image.opacity) },
    signature: { opacity: opacity(signature.opacity, defaults.signature.opacity) },
  };
};

export const loadEditorStylePreferences = () => {
  if (typeof window === "undefined") return parseEditorStylePreferences(null);
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return parseEditorStylePreferences(stored ? JSON.parse(stored) : null);
  } catch {
    return parseEditorStylePreferences(null);
  }
};

export const saveEditorStylePreferences = (preferences: EditorStylePreferences) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Editing remains fully functional when storage is unavailable or full.
  }
};

const STYLE_KEYS: Record<EditorElement["type"], readonly string[]> = {
  text: ["fontFamily", "fontSize", "color", "bold", "align", "opacity"],
  draw: ["color", "strokeWidth", "opacity"],
  line: ["color", "strokeWidth", "opacity"],
  highlight: ["color", "opacity"],
  redact: ["color", "opacity"],
  image: ["opacity"],
  signature: ["opacity"],
};

export const rememberElementStyle = (
  preferences: EditorStylePreferences,
  element: EditorElement,
  patch: Partial<EditorElement>,
): EditorStylePreferences => {
  const patchValues = patch as Record<string, unknown>;
  const stylePatch = Object.fromEntries(
    STYLE_KEYS[element.type]
      .filter((key) => key in patchValues)
      .map((key) => [key, patchValues[key]]),
  );
  if (Object.keys(stylePatch).length === 0) return preferences;

  return parseEditorStylePreferences({
    ...preferences,
    [element.type]: {
      ...preferences[element.type],
      ...stylePatch,
    },
  });
};
