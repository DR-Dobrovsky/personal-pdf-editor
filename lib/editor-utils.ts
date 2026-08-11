import type {
  EditorElement,
  EditorPage,
  EditorSnapshot,
  SpaceBand,
} from "@/types/editor";

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

export const normalizedRotation = (rotation: number) =>
  ((rotation % 360) + 360) % 360;

export const orderedSpaces = (page: EditorPage) =>
  [...page.spaces].sort(
    (left, right) => left.sourceY - right.sourceY || left.id.localeCompare(right.id),
  );

export const totalSpaceHeight = (page: EditorPage) =>
  page.spaces.reduce((total, space) => total + space.height, 0);

export const basePageDisplaySize = (page: EditorPage) =>
  displaySize(
    page.width,
    page.height,
    page.originalRotation + page.rotation,
  );

export const pageDisplaySize = (page: EditorPage) => {
  const base = basePageDisplaySize(page);
  return { width: base.width, height: base.height + totalSpaceHeight(page) };
};

export const spaceVisualTop = (page: EditorPage, target: SpaceBand) => {
  let offset = 0;
  for (const space of orderedSpaces(page)) {
    if (space.id === target.id) return space.sourceY + offset;
    offset += space.height;
  }
  return target.sourceY + offset;
};

export const spaceAtVisualY = (page: EditorPage, visualY: number) =>
  orderedSpaces(page).find((space) => {
    const top = spaceVisualTop(page, space);
    return visualY >= top && visualY <= top + space.height;
  });

export const visualYToSourceY = (page: EditorPage, visualY: number) => {
  let offset = 0;
  for (const space of orderedSpaces(page)) {
    const top = space.sourceY + offset;
    if (visualY < top) break;
    if (visualY <= top + space.height) return space.sourceY;
    offset += space.height;
  }
  return visualY - offset;
};

export const contentOffsetAtSourceY = (page: EditorPage, sourceY: number) =>
  orderedSpaces(page).reduce(
    (offset, space) => offset + (space.sourceY <= sourceY ? space.height : 0),
    0,
  );

export const outputPageSize = (page: EditorPage) => {
  const extra = totalSpaceHeight(page);
  const rotation = normalizedRotation(page.originalRotation + page.rotation);
  return rotation === 90 || rotation === 270
    ? { width: page.width + extra, height: page.height }
    : { width: page.width, height: page.height + extra };
};

export const isTextElement = (
  element: EditorElement | undefined,
): element is Extract<EditorElement, { type: "text" }> =>
  element?.type === "text";

export const isImageElement = (
  element: EditorElement | undefined,
): element is Extract<EditorElement, { type: "image" | "signature" }> =>
  element?.type === "image" || element?.type === "signature";
