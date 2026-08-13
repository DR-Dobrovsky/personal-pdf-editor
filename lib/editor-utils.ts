import type {
  EditorElement,
  EditorPage,
  EditorSnapshot,
  LineElement,
  Point,
  SpaceBand,
} from "@/types/editor";

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const cloneSnapshot = (snapshot: EditorSnapshot): EditorSnapshot =>
  structuredClone(snapshot);

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export interface LineGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  start: Point;
  end: Point;
}

const MIN_LINE_BOX = 12;
const LINE_SNAP_TOLERANCE = 5;

export const lineGeometry = (
  start: Point,
  end: Point,
  pageWidth: number,
  pageHeight: number,
): LineGeometry => {
  const axis = (first: number, second: number, limit: number) => {
    const minimum = Math.min(first, second);
    const maximum = Math.max(first, second);
    const range = maximum - minimum;
    if (range >= MIN_LINE_BOX) return { origin: minimum, size: range };
    const size = Math.min(MIN_LINE_BOX, limit);
    const center = (first + second) / 2;
    return {
      origin: clamp(center - size / 2, 0, Math.max(0, limit - size)),
      size,
    };
  };
  const horizontal = axis(start.x, end.x, pageWidth);
  const vertical = axis(start.y, end.y, pageHeight);
  const normalize = (point: Point): Point => ({
    x: clamp((point.x - horizontal.origin) / horizontal.size, 0, 1),
    y: clamp((point.y - vertical.origin) / vertical.size, 0, 1),
  });
  return {
    x: horizontal.origin,
    y: vertical.origin,
    width: horizontal.size,
    height: vertical.size,
    start: normalize(start),
    end: normalize(end),
  };
};

export const lineEndpoints = (element: LineElement) => ({
  start: {
    x: element.x + element.start.x * element.width,
    y: element.y + element.start.y * element.height,
  },
  end: {
    x: element.x + element.end.x * element.width,
    y: element.y + element.end.y * element.height,
  },
});

export interface VisualBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export const elementVisualBounds = (element: EditorElement): VisualBounds => {
  if (element.type !== "line") {
    return {
      left: element.x,
      top: element.y,
      right: element.x + element.width,
      bottom: element.y + element.height,
      width: element.width,
      height: element.height,
    };
  }
  const { start, end } = lineEndpoints(element);
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const right = Math.max(start.x, end.x);
  const bottom = Math.max(start.y, end.y);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};

export const elementsVisualBounds = (
  elements: readonly EditorElement[],
): VisualBounds | null => {
  if (elements.length === 0) return null;
  const bounds = elements.map(elementVisualBounds);
  const left = Math.min(...bounds.map((value) => value.left));
  const top = Math.min(...bounds.map((value) => value.top));
  const right = Math.max(...bounds.map((value) => value.right));
  const bottom = Math.max(...bounds.map((value) => value.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};

export const visualBoundsIntersect = (left: VisualBounds, right: VisualBounds) =>
  left.left <= right.right
  && left.right >= right.left
  && left.top <= right.bottom
  && left.bottom >= right.top;

export const translateElement = (
  element: EditorElement,
  deltaX: number,
  deltaY: number,
  pageWidth: number,
  pageHeight: number,
): EditorElement => {
  if (element.type !== "line") {
    return { ...element, x: element.x + deltaX, y: element.y + deltaY } as EditorElement;
  }
  const { start, end } = lineEndpoints(element);
  return {
    ...element,
    ...lineGeometry(
      { x: start.x + deltaX, y: start.y + deltaY },
      { x: end.x + deltaX, y: end.y + deltaY },
      pageWidth,
      pageHeight,
    ),
  };
};

export const lineMetrics = (element: LineElement) => {
  const { start, end } = lineEndpoints(element);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return {
    start,
    end,
    length: Math.hypot(dx, dy),
    angle: Math.atan2(dy, dx) * 180 / Math.PI,
  };
};

export const snapLineEndpoint = (fixed: Point, candidate: Point): Point => {
  const angle = Math.abs(
    Math.atan2(candidate.y - fixed.y, candidate.x - fixed.x) * 180 / Math.PI,
  );
  if (angle <= LINE_SNAP_TOLERANCE || angle >= 180 - LINE_SNAP_TOLERANCE) {
    return { x: candidate.x, y: fixed.y };
  }
  if (Math.abs(angle - 90) <= LINE_SNAP_TOLERANCE) {
    return { x: fixed.x, y: candidate.y };
  }
  return candidate;
};

export const lineGeometryFromMetrics = (
  element: LineElement,
  angle: number,
  requestedLength: number,
  pageWidth: number,
  pageHeight: number,
): LineGeometry => {
  const { start } = lineEndpoints(element);
  const radians = angle * Math.PI / 180;
  const rawDirection = { x: Math.cos(radians), y: Math.sin(radians) };
  const direction = {
    x: Math.abs(rawDirection.x) < 1e-9 ? 0 : rawDirection.x,
    y: Math.abs(rawDirection.y) < 1e-9 ? 0 : rawDirection.y,
  };
  const horizontalMaximum = direction.x === 0
    ? Number.POSITIVE_INFINITY
    : pageWidth / Math.abs(direction.x);
  const verticalMaximum = direction.y === 0
    ? Number.POSITIVE_INFINITY
    : pageHeight / Math.abs(direction.y);
  const maximumLength = Math.max(0, Math.min(horizontalMaximum, verticalMaximum));
  const length = clamp(requestedLength, Math.min(0.1, maximumLength), maximumLength);
  const candidateEnd = {
    x: start.x + direction.x * length,
    y: start.y + direction.y * length,
  };
  const minimumX = Math.min(start.x, candidateEnd.x);
  const maximumX = Math.max(start.x, candidateEnd.x);
  const minimumY = Math.min(start.y, candidateEnd.y);
  const maximumY = Math.max(start.y, candidateEnd.y);
  const shiftX = minimumX < 0 ? -minimumX : maximumX > pageWidth ? pageWidth - maximumX : 0;
  const shiftY = minimumY < 0 ? -minimumY : maximumY > pageHeight ? pageHeight - maximumY : 0;
  const translatedStart = { x: start.x + shiftX, y: start.y + shiftY };
  const translatedEnd = { x: candidateEnd.x + shiftX, y: candidateEnd.y + shiftY };
  return lineGeometry(
    translatedStart,
    translatedEnd,
    pageWidth,
    pageHeight,
  );
};

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
