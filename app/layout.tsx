import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Platform — Audio Review Workspace",
  description: "A private workspace for lossless audio, versions, and timeline review.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
