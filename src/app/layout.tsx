import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: "TutorLab",
  description: "Build evidence-grounded AI tutors from course materials.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
