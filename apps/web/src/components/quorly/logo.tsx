import { existsSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import Link from "next/link";

const PUBLIC_DIR = join(process.cwd(), "apps", "web", "public");
const FALLBACK_DIR = join(process.cwd(), "public");

/**
 * Uses whatever logo file is present, and falls back to the wordmark when
 * there is none — so a missing asset never shows a broken image, and dropping
 * one in needs no code change.
 */
function findLogo(): { src: string; width: number; height: number } | null {
  for (const dir of [PUBLIC_DIR, FALLBACK_DIR]) {
    for (const name of ["logo.svg", "logo.png"]) {
      if (existsSync(join(dir, name))) {
        return { src: `/${name}`, width: 200, height: 200 };
      }
    }
  }
  return null;
}

export function Logo({ href = "/" }: { href?: string }) {
  const logo = findLogo();

  return (
    <Link href={href} className="group flex shrink-0 items-center" aria-label="Quorly">
      {logo ? (
        // A square mark reads better paired with the wordmark than alone.
        <span className="flex items-center gap-2.5">
          <Image
            src={logo.src}
            alt=""
            width={logo.width}
            height={logo.height}
            priority
            className="size-7 rounded-md transition-transform duration-300 group-hover:scale-105"
          />
          <span className="display text-xl leading-none">Quorly</span>
        </span>
      ) : (
        <span className="flex items-baseline gap-[3px]">
          <span className="display text-xl leading-none">Quorly</span>
          <span
            aria-hidden
            className="mb-[3px] size-[5px] rounded-full bg-forest transition-transform duration-300 group-hover:scale-150"
          />
        </span>
      )}
    </Link>
  );
}
