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
  | { kind: "elements"; pageId: string; ids: string[]; primaryId: string }
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
  | "Hanken Grotesk Thin"
  | "Hanken Grotesk Thin Italic"
  | "Hanken Grotesk Extra Light"
  | "Hanken Grotesk Extra Light Italic"
  | "Hanken Grotesk Light"
  | "Hanken Grotesk Light Italic"
  | "Hanken Grotesk Regular"
  | "Hanken Grotesk Italic"
  | "Hanken Grotesk Medium"
  | "Hanken Grotesk Medium Italic"
  | "Hanken Grotesk Semi Bold"
  | "Hanken Grotesk Semi Bold Italic"
  | "Hanken Grotesk Bold"
  | "Hanken Grotesk Bold Italic"
  | "Hanken Grotesk Extra Bold"
  | "Hanken Grotesk Extra Bold Italic"
  | "Hanken Grotesk Black"
  | "Hanken Grotesk Black Italic"
  | "Inter Thin"
  | "Inter Thin Italic"
  | "Inter Extra Light"
  | "Inter Extra Light Italic"
  | "Inter Light"
  | "Inter Light Italic"
  | "Inter Regular"
  | "Inter Italic"
  | "Inter Medium"
  | "Inter Medium Italic"
  | "Inter Semi Bold"
  | "Inter Semi Bold Italic"
  | "Inter Bold"
  | "Inter Bold Italic"
  | "Inter Extra Bold"
  | "Inter Extra Bold Italic"
  | "Inter Black"
  | "Inter Black Italic"
  | "Roboto Thin"
  | "Roboto Thin Italic"
  | "Roboto Extra Light"
  | "Roboto Extra Light Italic"
  | "Roboto Light"
  | "Roboto Light Italic"
  | "Roboto Regular"
  | "Roboto Italic"
  | "Roboto Medium"
  | "Roboto Medium Italic"
  | "Roboto Semi Bold"
  | "Roboto Semi Bold Italic"
  | "Roboto Bold"
  | "Roboto Bold Italic"
  | "Roboto Extra Bold"
  | "Roboto Extra Bold Italic"
  | "Roboto Black"
  | "Roboto Black Italic"
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
