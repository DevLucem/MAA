import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "./components/AppShell";
import "./globals.css";
import "./notion.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MAA",
  description: "Next.js application with sidebar, toolbar, and content layout",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="bg-canvas text-foreground font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
