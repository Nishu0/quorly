"use client";

/**
 * The approval path, drawn.
 *
 * Beams travel left to right along each curve so the eye follows the sequence
 * — invoice arrives, policy routes it, a live human clears it, the quorum
 * releases the money. Static diagrams make readers hunt for the order.
 */
const NODES = [
  { id: "slack", label: "Slack DM", x: 60, y: 150, sub: "invoice PDF" },
  { id: "policy", label: "Policy", x: 250, y: 150, sub: "routes by amount" },
  { id: "selfie", label: "Selfie Check", x: 450, y: 80, sub: "live human" },
  { id: "quorum", label: "Key quorum", x: 450, y: 220, sub: "m-of-n signatures" },
  { id: "payout", label: "Payout", x: 660, y: 150, sub: "onchain" },
];

const EDGES = [
  { from: "slack", to: "policy", delay: 0 },
  { from: "policy", to: "selfie", delay: 0.5 },
  { from: "policy", to: "quorum", delay: 0.5 },
  { from: "selfie", to: "payout", delay: 1.1 },
  { from: "quorum", to: "payout", delay: 1.1 },
];

const node = (id: string) => NODES.find((n) => n.id === id)!;

/** A cubic curve that leaves and enters horizontally, so joins look deliberate. */
function curve(a: (typeof NODES)[number], b: (typeof NODES)[number]) {
  const mid = (a.x + b.x) / 2;
  return `M ${a.x + 62} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x - 62} ${b.y}`;
}

export function FlowDiagram() {
  return (
    <svg
      viewBox="0 0 780 300"
      className="h-auto w-full"
      role="img"
      aria-label="An invoice arrives in Slack, policy routes it, a Selfie Check and the key quorum gate it, then the payout settles onchain."
    >
      <defs>
        <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--forest)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--forest)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--forest)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {EDGES.map((e) => {
        const d = curve(node(e.from), node(e.to));
        return (
          <g key={`${e.from}-${e.to}`}>
            <path d={d} fill="none" stroke="var(--rule-strong)" strokeWidth="1" />
            <path
              d={d}
              fill="none"
              stroke="url(#beam)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="60 400"
              className="beam"
              style={{ animationDelay: `${e.delay}s` }}
            />
          </g>
        );
      })}

      {NODES.map((n, i) => (
        <g key={n.id} className="reveal" style={{ animationDelay: `${i * 90}ms` }}>
          <rect
            x={n.x - 62}
            y={n.y - 26}
            width="124"
            height="52"
            rx="10"
            fill="var(--card)"
            stroke="var(--rule-strong)"
          />
          <text
            x={n.x}
            y={n.y - 3}
            textAnchor="middle"
            className="fill-foreground font-sans text-[13px] font-medium"
          >
            {n.label}
          </text>
          <text
            x={n.x}
            y={n.y + 13}
            textAnchor="middle"
            className="fill-ink-faint font-mono text-[9px]"
          >
            {n.sub}
          </text>
        </g>
      ))}

      <style>{`
        .beam {
          stroke-dashoffset: 460;
          animation: beam-travel 3.2s linear infinite;
        }
        @keyframes beam-travel {
          to { stroke-dashoffset: -60; }
        }
        @media (prefers-reduced-motion: reduce) {
          .beam { animation: none; opacity: 0.45; stroke-dasharray: none; }
        }
      `}</style>
    </svg>
  );
}
