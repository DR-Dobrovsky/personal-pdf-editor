export type EditorTool =
  | "select"
  | "space"
  | "text"
  | "image"
  | "signature"
  | "draw"
  | "line"
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

export type TextFontFamily =
  | "Aeonik Pro"
  | "Aeonik Air"
  | "Aeonik Air Italic"
  | "Aeonik Thin"
  | "Aeonik Thin Italic"
  | "Aeonik Light"
  | "Aeonik Light Italic"
  | "Aeonik Regular Italic"
  | "Aeonik Medium"
  | "Aeonik Bold"
  | "Aeonik Bold Italic"
  | "Aeonik Black"
  | "Aeonik Black Italic"
  | "Aeonik Overview Regular"
  | "Aeonik Overview Medium"
  | "Arial"
  | "Helvetica"
  | "Times New Roman"
  | "Courier New";

export interface TextElement extends ElementBase {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: TextFontFamily;
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

export interface LineElement extends ElementBase {
  type: "line";
  /** Endpoints normalized to this element's interaction box. */
  start: Point;
  end: Point;
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
  | LineElement
  | HighlightElement
  | RedactElement;

export interface EditorSnapshot {
  pages: EditorPage[];
  elements: EditorElement[];
}
