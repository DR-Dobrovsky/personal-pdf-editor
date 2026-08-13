import type { TextFontFamily } from "@/types/editor";

type PdfFontSource =
  | { kind: "standard"; family: "sans" | "serif" | "mono" }
  | { kind: "custom"; regularUrl: string };

type EditorFontGroup = "Aeonik" | "Hanken Grotesk" | "Inter" | "Roboto" | "Standard";

interface EditorFontDefinition {
  id: TextFontFamily;
  label: string;
  group: EditorFontGroup;
  cssFamily: string;
  supportsBold: boolean;
  pdf: PdfFontSource;
}

const customFace = (
  id: TextFontFamily,
  group: Exclude<EditorFontGroup, "Standard">,
  filename: string,
): EditorFontDefinition => ({
  id,
  label: id,
  group,
  cssFamily: `"${id}", Arial, sans-serif`,
  supportsBold: false,
  pdf: { kind: "custom", regularUrl: `/fonts/${filename}` },
});

const aeonikFace = (id: TextFontFamily, filename: string) =>
  customFace(id, "Aeonik", filename);

const hankenGroteskFace = (id: TextFontFamily, filename: string) =>
  customFace(id, "Hanken Grotesk", filename);

const interFace = (id: TextFontFamily, filename: string) =>
  customFace(id, "Inter", filename);

const robotoFace = (id: TextFontFamily, filename: string) =>
  customFace(id, "Roboto", filename);

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
  hankenGroteskFace("Hanken Grotesk Thin", "HankenGrotesk-Thin.ttf"),
  hankenGroteskFace("Hanken Grotesk Thin Italic", "HankenGrotesk-ThinItalic.ttf"),
  hankenGroteskFace("Hanken Grotesk Extra Light", "HankenGrotesk-ExtraLight.ttf"),
  hankenGroteskFace("Hanken Grotesk Extra Light Italic", "HankenGrotesk-ExtraLightItalic.ttf"),
  hankenGroteskFace("Hanken Grotesk Light", "HankenGrotesk-Light.ttf"),
  hankenGroteskFace("Hanken Grotesk Light Italic", "HankenGrotesk-LightItalic.ttf"),
  hankenGroteskFace("Hanken Grotesk Regular", "HankenGrotesk-Regular.ttf"),
  hankenGroteskFace("Hanken Grotesk Italic", "HankenGrotesk-Italic.ttf"),
  hankenGroteskFace("Hanken Grotesk Medium", "HankenGrotesk-Medium.ttf"),
  hankenGroteskFace("Hanken Grotesk Medium Italic", "HankenGrotesk-MediumItalic.ttf"),
  hankenGroteskFace("Hanken Grotesk Semi Bold", "HankenGrotesk-SemiBold.ttf"),
  hankenGroteskFace("Hanken Grotesk Semi Bold Italic", "HankenGrotesk-SemiBoldItalic.ttf"),
  hankenGroteskFace("Hanken Grotesk Bold", "HankenGrotesk-Bold.ttf"),
  hankenGroteskFace("Hanken Grotesk Bold Italic", "HankenGrotesk-BoldItalic.ttf"),
  hankenGroteskFace("Hanken Grotesk Extra Bold", "HankenGrotesk-ExtraBold.ttf"),
  hankenGroteskFace("Hanken Grotesk Extra Bold Italic", "HankenGrotesk-ExtraBoldItalic.ttf"),
  hankenGroteskFace("Hanken Grotesk Black", "HankenGrotesk-Black.ttf"),
  hankenGroteskFace("Hanken Grotesk Black Italic", "HankenGrotesk-BlackItalic.ttf"),
  interFace("Inter Thin", "Inter_18pt-Thin.ttf"),
  interFace("Inter Thin Italic", "Inter_18pt-ThinItalic.ttf"),
  interFace("Inter Extra Light", "Inter_18pt-ExtraLight.ttf"),
  interFace("Inter Extra Light Italic", "Inter_18pt-ExtraLightItalic.ttf"),
  interFace("Inter Light", "Inter_18pt-Light.ttf"),
  interFace("Inter Light Italic", "Inter_18pt-LightItalic.ttf"),
  interFace("Inter Regular", "Inter_18pt-Regular.ttf"),
  interFace("Inter Italic", "Inter_18pt-Italic.ttf"),
  interFace("Inter Medium", "Inter_18pt-Medium.ttf"),
  interFace("Inter Medium Italic", "Inter_18pt-MediumItalic.ttf"),
  interFace("Inter Semi Bold", "Inter_18pt-SemiBold.ttf"),
  interFace("Inter Semi Bold Italic", "Inter_18pt-SemiBoldItalic.ttf"),
  interFace("Inter Bold", "Inter_18pt-Bold.ttf"),
  interFace("Inter Bold Italic", "Inter_18pt-BoldItalic.ttf"),
  interFace("Inter Extra Bold", "Inter_18pt-ExtraBold.ttf"),
  interFace("Inter Extra Bold Italic", "Inter_18pt-ExtraBoldItalic.ttf"),
  interFace("Inter Black", "Inter_18pt-Black.ttf"),
  interFace("Inter Black Italic", "Inter_18pt-BlackItalic.ttf"),
  robotoFace("Roboto Thin", "Roboto-Thin.ttf"),
  robotoFace("Roboto Thin Italic", "Roboto-ThinItalic.ttf"),
  robotoFace("Roboto Extra Light", "Roboto-ExtraLight.ttf"),
  robotoFace("Roboto Extra Light Italic", "Roboto-ExtraLightItalic.ttf"),
  robotoFace("Roboto Light", "Roboto-Light.ttf"),
  robotoFace("Roboto Light Italic", "Roboto-LightItalic.ttf"),
  robotoFace("Roboto Regular", "Roboto-Regular.ttf"),
  robotoFace("Roboto Italic", "Roboto-Italic.ttf"),
  robotoFace("Roboto Medium", "Roboto-Medium.ttf"),
  robotoFace("Roboto Medium Italic", "Roboto-MediumItalic.ttf"),
  robotoFace("Roboto Semi Bold", "Roboto-SemiBold.ttf"),
  robotoFace("Roboto Semi Bold Italic", "Roboto-SemiBoldItalic.ttf"),
  robotoFace("Roboto Bold", "Roboto-Bold.ttf"),
  robotoFace("Roboto Bold Italic", "Roboto-BoldItalic.ttf"),
  robotoFace("Roboto Extra Bold", "Roboto-ExtraBold.ttf"),
  robotoFace("Roboto Extra Bold Italic", "Roboto-ExtraBoldItalic.ttf"),
  robotoFace("Roboto Black", "Roboto-Black.ttf"),
  robotoFace("Roboto Black Italic", "Roboto-BlackItalic.ttf"),
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

const FONT_GROUPS: readonly { group: EditorFontGroup; label: string }[] = [
  { group: "Aeonik", label: "Aeonik family" },
  { group: "Hanken Grotesk", label: "Hanken Grotesk family" },
  { group: "Inter", label: "Inter family" },
  { group: "Roboto", label: "Roboto family" },
  { group: "Standard", label: "Standard fonts" },
];

export const EDITOR_FONT_GROUPS = FONT_GROUPS.map(({ group, label }) => ({
  group,
  label,
  fonts: EDITOR_FONTS.filter((font) => font.group === group),
}));

const fontById = new Map(EDITOR_FONTS.map((font) => [font.id, font]));

export const isTextFontFamily = (value: unknown): value is TextFontFamily =>
  typeof value === "string" && fontById.has(value as TextFontFamily);

export const editorFont = (family: TextFontFamily) =>
  fontById.get(family) ?? EDITOR_FONTS[0];
