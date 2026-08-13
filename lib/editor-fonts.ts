import type { TextFontFamily } from "@/types/editor";

interface EditorFontDefinition {
  id: TextFontFamily;
  label: string;
  cssFamily: string;
  pdfFamily: "sans" | "serif" | "mono";
}

export const EDITOR_FONTS: readonly EditorFontDefinition[] = [
  {
    id: "Arial",
    label: "Arial",
    cssFamily: 'Arial, Helvetica, sans-serif',
    pdfFamily: "sans",
  },
  {
    id: "Helvetica",
    label: "Helvetica",
    cssFamily: 'Helvetica, Arial, sans-serif',
    pdfFamily: "sans",
  },
  {
    id: "Times New Roman",
    label: "Times New Roman",
    cssFamily: '"Times New Roman", Times, serif',
    pdfFamily: "serif",
  },
  {
    id: "Courier New",
    label: "Courier New",
    cssFamily: '"Courier New", Courier, monospace',
    pdfFamily: "mono",
  },
] as const;

const fontById = new Map(EDITOR_FONTS.map((font) => [font.id, font]));

export const isTextFontFamily = (value: unknown): value is TextFontFamily =>
  typeof value === "string" && fontById.has(value as TextFontFamily);

export const editorFont = (family: TextFontFamily) =>
  fontById.get(family) ?? EDITOR_FONTS[0];
