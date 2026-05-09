"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import NavLinks from "@/app/nav-links";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return children;
  }

  return (
    <>
      <nav className="nav">
        <span className="nav-brand">recall</span>
        <NavLinks />
      </nav>
      {children}
    </>
  );
}
