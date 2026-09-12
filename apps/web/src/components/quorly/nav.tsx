"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map((l) => {
        // "/" would otherwise match everything, so it needs exact comparison.
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-md px-3 py-1.5 transition-colors duration-200",
              active ? "text-foreground" : "text-ink-soft hover:text-foreground",
            )}
          >
            {l.label}
            {active && (
              <span className="absolute inset-x-3 -bottom-px h-px bg-forest" aria-hidden />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
