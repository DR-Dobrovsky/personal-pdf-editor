import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paperly — Private PDF editor",
  description: "Edit PDFs privately in your browser.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
