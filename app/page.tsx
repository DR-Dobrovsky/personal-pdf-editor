import dynamic from "next/dynamic";

const PdfEditor = dynamic(() => import("@/components/editor/pdf-editor"));

export default function Home() {
  return <PdfEditor />;
}
