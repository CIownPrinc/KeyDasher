import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fredoka } from "next/font/google";
import { env } from "@/env";
import "./globals.css";

const display = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const description =
  "A fast, colorful typing platformer. Type words to run, jump, and zip through candy obstacle courses, pick risky shortcuts, and race friends or bots in real time.";

export const metadata: Metadata = {
  metadataBase: new URL(env.SITE_URL),
  title: { default: "KeyDasher: the typing platformer race", template: "%s · KeyDasher" },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "KeyDasher: the typing platformer race",
    description,
    type: "website",
    siteName: "KeyDasher",
  },
};

export const viewport: Viewport = {
  themeColor: "#6b5cff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
