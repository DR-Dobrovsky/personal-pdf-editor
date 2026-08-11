export type EditorTool =
  | "select"
  | "space"
  | "text"
  | "image"
  | "signature"
  | "draw"
  | "highlight"
  | "redact";

export type Point = { x: number; y: number };

export interface SpaceBand {
  id: string;
  /** Cut position in the original page's rotated visual coordinates. */
  sourceY: number;
  height: number;
}

export type LinkDestinationMode =
  | "XYZ"
  | "Fit"
  | "FitH"
  | "FitV"
  | "FitR"
  | "FitB"
  | "FitBH"
  | "FitBV";

export interface SourceLinkAnnotation {
  internal: boolean;
  targetSourceIndex?: number;
  destination?: {
    mode: LinkDestinationMode;
    parameters: Array<number | null>;
  };
}

export interface EditorPage {
  id: string;
  sourceIndex: number;
  width: number;
  height: number;
  originalRotation: number;
  rotation: number;
  hasFormFields: boolean;
  links: SourceLinkAnnotation[];
  spaces: SpaceBand[];
}

export type EditorSelection =
  | { kind: "element"; id: string }
  | { kind: "space"; pageId: string; id: string }
  | null;

interface ElementBase {
  id: string;
  pageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export interface TextElement extends ElementBase {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: "Helvetica" | "Times Roman" | "Courier";
  color: string;
  bold: boolean;
  align: "left" | "center" | "right";
}

export interface ImageElement extends ElementBase {
  type: "image";
  src: string;
}

export interface SignatureElement extends ElementBase {
  type: "signature";
  src: string;
}

export interface DrawingElement extends ElementBase {
  type: "draw";
  points: Point[];
  color: string;
  strokeWidth: number;
}

export interface HighlightElement extends ElementBase {
  type: "highlight";
  color: string;
}

export interface RedactElement extends ElementBase {
  type: "redact";
  color: string;
}

export type BlockElement = HighlightElement | RedactElement;

export type EditorElement =
  | TextElement
  | ImageElement
  | SignatureElement
  | DrawingElement
  | HighlightElement
  | RedactElement;

export interface EditorSnapshot {
  pages: EditorPage[];
  elements: EditorElement[];
}
