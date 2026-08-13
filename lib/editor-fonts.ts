import type { TextFontFamily } from "@/types/editor";

type PdfFontSource =
  | { kind: "standard"; family: "sans" | "serif" | "mono" }
  | { kind: "custom"; regularUrl: string };

type EditorFontGroup = "Aeonik" | "Standard";

interface EditorFontDefinition {
  id: TextFontFamily;
  label: string;
  group: EditorFontGroup;
  cssFamily: string;
  supportsBold: boolean;
  pdf: PdfFontSource;
}

const aeonikFace = (
  id: TextFontFamily,
  filename: string,
): EditorFontDefinition => ({
  id,
  label: id,
  group: "Aeonik",
  cssFamily: `"${id}", Arial, sans-serif`,
  supportsBold: false,
  pdf: { kind: "custom", regularUrl: `/fonts/${filename}` },
});

export const EDITOR_FONTS: readonly EditorFontDefinition[] = [
  aeonikFace("Aeonik Pro", "AeonikPro-Regular.ttf"),
  aeonikFace("Aeonik Air", "Aeonik-Air.ttf"),
  aeonikFace("Aeonik Air Italic", "Aeonik-AirItalic.ttf"),
  aeonikFace("Aeonik Thin", "Aeonik-Thin.ttf"),
  aeonikFace("Aeonik Thin Italic", "Aeonik-ThinItalic.ttf"),
  aeonikFace("Aeonik Light", "Aeonik-Light.ttf"),
  aeonikFace("Aeonik Light Italic", "Aeonik-LightItalic.ttf"),
  aeonikFace("Aeonik Regular Italic", "Aeonik-RegularItalic.ttf"),
  aeonikFace("Aeonik Medium", "Aeonik-Medium.ttf"),
  aeonikFace("Aeonik Bold", "Aeonik-Bold.ttf"),
  aeonikFace("Aeonik Bold Italic", "Aeonik-BoldItalic.ttf"),
  aeonikFace("Aeonik Black", "Aeonik-Black.ttf"),
  aeonikFace("Aeonik Black Italic", "Aeonik-BlackItalic.ttf"),
  aeonikFace("Aeonik Overview Regular", "Aeonik-Overview-Regular.ttf"),
  aeonikFace("Aeonik Overview Medium", "Aeonik-Overview-Medium.ttf"),
  {
    id: "Arial",
    label: "Arial",
    group: "Standard",
    cssFamily: "Arial, Helvetica, sans-serif",
    supportsBold: true,
    pdf: { kind: "standard", family: "sans" },
  },
  {
    id: "Helvetica",
    label: "Helvetica",
    group: "Standard",
    cssFamily: "Helvetica, Arial, sans-serif",
    supportsBold: true,
    pdf: { kind: "standard", family: "sans" },
  },
  {
    id: "Times New Roman",
    label: "Times New Roman",
    group: "Standard",
    cssFamily: '"Times New Roman", Times, serif',
    supportsBold: true,
    pdf: { kind: "standard", family: "serif" },
  },
  {
    id: "Courier New",
    label: "Courier New",
    group: "Standard",
    cssFamily: '"Courier New", Courier, monospace',
    supportsBold: true,
    pdf: { kind: "standard", family: "mono" },
  },
];

export const EDITOR_FONT_GROUPS = (["Aeonik", "Standard"] as const).map((group) => ({
  group,
  label: group === "Aeonik" ? "Aeonik family" : "Standard fonts",
  fonts: EDITOR_FONTS.filter((font) => font.group === group),
}));

const fontById = new Map(EDITOR_FONTS.map((font) => [font.id, font]));

export const isTextFontFamily = (value: unknown): value is TextFontFamily =>
  typeof value === "string" && fontById.has(value as TextFontFamily);

export const editorFont = (family: TextFontFamily) =>
  fontById.get(family) ?? EDITOR_FONTS[0];
