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

/**
 * `bare` renders the mark with no anchor of its own, for callers that already
 * wrap it in a link — nesting one <a> inside another is invalid HTML and React
 * refuses it outright.
 */
export function Logo({
  href = "/",
  bare = false,
  markOnly = false,
}: {
  href?: string;
  bare?: boolean;
  /** Just the square mark, for chrome that supplies its own wordmark. */
  markOnly?: boolean;
}) {
  const logo = findLogo();
  const inner = <LogoMark logo={logo} markOnly={markOnly} />;

  if (bare) return inner;

  return (
    <Link href={href} className="group flex shrink-0 items-center" aria-label="Quorly">
      {inner}
    </Link>
  );
}

function LogoMark({
  logo,
  markOnly,
}: {
  logo: { src: string; width: number; height: number } | null;
  markOnly?: boolean;
}) {
  if (logo && markOnly) {
    return (
      <Image
        src={logo.src}
        alt=""
        width={logo.width}
        height={logo.height}
        priority
        className="size-8 rounded-md transition-transform duration-300 group-hover:scale-105"
      />
    );
  }

  return (
    <>
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
    </>
  );
}
