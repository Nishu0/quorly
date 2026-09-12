import Image from "next/image";

/**
 * The one lockup: square mark plus the pixel wordmark. Every surface uses this
 * so the brand doesn't change shape between the landing page, the sign-in
 * screen and the dashboard.
 */
export function BrandMark({
  size = "md",
  tone = "ink",
  className = "",
}: {
  size?: "sm" | "md";
  tone?: "ink" | "light";
  className?: string;
}) {
  const mark = size === "sm" ? "size-5" : "size-8";
  const text = size === "sm" ? "text-[0.6875rem]" : "text-[0.8125rem]";
  const color = tone === "light" ? "text-white" : "text-[var(--panel-ink,#0b1f31)]";

  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/logo.png"
        alt=""
        width={200}
        height={200}
        priority
        className={`${mark} rounded-md transition-transform duration-300 group-hover:scale-105`}
      />
      <span className={`pixel leading-none ${text} ${color}`}>QUORLY</span>
    </span>
  );
}
