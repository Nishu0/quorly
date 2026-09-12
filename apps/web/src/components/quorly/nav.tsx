"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="titlebar-pill hidden items-center gap-1 px-1.5 py-1 md:flex">
      {LINKS.map((l) => {
        // "/" is a prefix of everything, so it needs an exact match.
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            data-active={active}
            aria-current={active ? "page" : undefined}
            className="titlebar-link px-3.5 py-1.5 text-[0.8125rem]"
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
