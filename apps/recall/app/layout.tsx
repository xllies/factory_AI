import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppChrome } from "@/app/app-chrome";

export const metadata: Metadata = {
  title: "Recall",
  description: "Speak or type anything. AI saves your memories and surfaces your actions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
