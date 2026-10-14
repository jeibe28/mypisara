import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@/components/action-button";
import { ToastProvider } from "@/components/toast";
import { HoverHints } from "@/components/hover-hints";
import { preferencesScript } from "@/lib/preferences";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/caveat/700.css";
import "@fontsource/bebas-neue";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyPisara — Your visual board for ideas",
  description:
    "A calm, flexible canvas for notes, images, links, to-dos and plans. Arrange your thinking the way you see it.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferencesScript }} />
      </head>
      <body>
        <TooltipProvider>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
        <HoverHints />
      </body>
    </html>
  );
}
