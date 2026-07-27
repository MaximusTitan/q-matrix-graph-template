import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Curriculum Knowledge Graph",
  description:
    "A 3D map of curriculum concepts, layered by grade and wired together by prerequisite.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // System fonts rather than next/font/google: this is a static export, and a
  // webfont fetch at build time is a network dependency the build does not
  // need and a third party the page does not need to trust.
  //
  // Dark-only by design — the subject palette is stepped and validated for the
  // dark canvas, and faint prerequisite links vanish on a light background.
  return (
    <html lang="en" className="h-full antialiased" style={{ colorScheme: "dark" }}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
