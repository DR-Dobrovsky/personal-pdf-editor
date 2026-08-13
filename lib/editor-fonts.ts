import type { TextFontFamily } from "@/types/editor";

type PdfFontSource =
  | { kind: "standard"; family: "sans" | "serif" | "mono" }
  | { kind: "custom"; regularUrl: string };

interface EditorFontDefinition {
  id: TextFontFamily;
  label: string;
  cssFamily: string;
  supportsBold: boolean;
  pdf: PdfFontSource;
}

export const EDITOR_FONTS: readonly EditorFontDefinition[] = [
  {
    id: "Aeonik Pro",
    label: "Aeonik Pro",
    cssFamily: '"Aeonik Pro", Arial, sans-serif',
    supportsBold: false,
    pdf: { kind: "custom", regularUrl: "/fonts/AeonikPro-Regular.ttf" },
  },
  {
    id: "Arial",
    label: "Arial",
    cssFamily: 'Arial, Helvetica, sans-serif',
    supportsBold: true,
    pdf: { kind: "standard", family: "sans" },
  },
  {
    id: "Helvetica",
    label: "Helvetica",
    cssFamily: 'Helvetica, Arial, sans-serif',
    supportsBold: true,
    pdf: { kind: "standard", family: "sans" },
  },
  {
    id: "Times New Roman",
    label: "Times New Roman",
    cssFamily: '"Times New Roman", Times, serif',
    supportsBold: true,
    pdf: { kind: "standard", family: "serif" },
  },
  {
    id: "Courier New",
    label: "Courier New",
    cssFamily: '"Courier New", Courier, monospace',
    supportsBold: true,
    pdf: { kind: "standard", family: "mono" },
  },
] as const;

const fontById = new Map(EDITOR_FONTS.map((font) => [font.id, font]));

export const isTextFontFamily = (value: unknown): value is TextFontFamily =>
  typeof value === "string" && fontById.has(value as TextFontFamily);

export const editorFont = (family: TextFontFamily) =>
  fontById.get(family) ?? EDITOR_FONTS[0];
