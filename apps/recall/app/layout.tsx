import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import NavLinks from "@/app/nav-links";

export const metadata: Metadata = {
  title: "Recall",
  description: "Speak or type anything. AI saves your memories and surfaces your actions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <span className="nav-brand">recall</span>
          <NavLinks />
        </nav>
        {children}
      </body>
    </html>
  );
}
