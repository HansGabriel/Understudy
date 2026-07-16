import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const display = localFont({ src: "./fonts/space-grotesk-latin.woff2", variable: "--font-display", weight: "300 700", style: "normal" });
const body = localFont({ src: "./fonts/ibm-plex-sans-latin.woff2", variable: "--font-body", weight: "400 700", style: "normal" });
const mono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Understudy — guided git replay practice",
  description: "Replay real changes, test the edge cases, own the code.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      {/* Browser extensions can add attributes to body before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
