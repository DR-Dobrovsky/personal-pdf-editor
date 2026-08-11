import type { EditorElement, EditorSnapshot } from "@/types/editor";

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const cloneSnapshot = (snapshot: EditorSnapshot): EditorSnapshot =>
  structuredClone(snapshot);

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const displaySize = (
  width: number,
  height: number,
  rotation: number,
) => {
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized === 90 || normalized === 270
    ? { width: height, height: width }
    : { width, height };
};

export const isTextElement = (
  element: EditorElement | undefined,
): element is Extract<EditorElement, { type: "text" }> =>
  element?.type === "text";

export const isImageElement = (
  element: EditorElement | undefined,
): element is Extract<EditorElement, { type: "image" | "signature" }> =>
  element?.type === "image" || element?.type === "signature";
