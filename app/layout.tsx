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
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem("color-scheme");if(s==="light"||s==="dark"){document.documentElement.dataset.theme=s;}else{delete document.documentElement.dataset.theme;}var m=document.querySelectorAll('meta[name="color-scheme"]');for(var i=0;i<m.length;i++){m[i].content=s??"light dark";}}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-canvas text-foreground font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
