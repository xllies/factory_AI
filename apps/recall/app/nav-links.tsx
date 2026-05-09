"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/today", label: "Today" },
  { href: "/", label: "Capture" },
  { href: "/shopping", label: "Shop" },
  { href: "/upload", label: "Upload" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
];

export default function NavLinks() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <div className="nav-links">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
          {l.label}
        </Link>
      ))}
      <form action="/auth/signout" method="post" style={{ display: "contents" }}>
        <button type="submit" className="nav-signout" title="Sign out">
          Sign out
        </button>
      </form>
    </div>
  );
}
