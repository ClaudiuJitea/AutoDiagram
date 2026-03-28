import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata = {
  title: "AutoDiagram – Generate editable diagrams from text, code, and images",
  description: "Turn prompts, files, and screenshots into editable Excalidraw diagrams in seconds. Open source and powered through OpenRouter.",
  openGraph: {
    title: "AutoDiagram – Generate editable diagrams from text, code, and images",
    description: "Turn prompts, files, and screenshots into editable Excalidraw diagrams in seconds. Open source and powered through OpenRouter.",
    images: [{ url: "/drawn-og.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AutoDiagram – Generate editable diagrams from text, code, and images",
    description: "Turn prompts, files, and screenshots into editable Excalidraw diagrams in seconds. Open source and powered through OpenRouter.",
    images: ["/drawn-og.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/drawn-logo.svg" type="image/svg+xml" />
      </head>
      <body className={`${rubik.variable} antialiased`}>{children}</body>
    </html>
  );
}
