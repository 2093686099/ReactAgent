import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Agent 助手",
  description: "智能体个人助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={`${inter.variable} antialiased [--font-mono:ui-monospace,'SF_Mono',Menlo,monospace]`}>
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            style: {
              background: "#191a1b",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#f7f8f8",
            },
          }}
        />
      </body>
    </html>
  );
}
