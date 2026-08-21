import { ArrowIcon } from "./Icons";
import { useReveal } from "../hooks/useReveal";

/** CSS/SVG-drawn stand-ins for terrain photography. */
function TerrainArt({ art }) {
  if (art === "trail") {
    return (
      <svg
        viewBox="0 0 400 520"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
        aria-hidden="true"
      >
        <rect width="400" height="520" fill="#2f3b32" />
        {Array.from({ length: 11 }, (_, i) => (
          <path
            key={i}
            d={`M-40 ${430 - i * 34} C 60 ${380 - i * 40}, 140 ${470 - i * 30}, 230 ${400 - i * 38} S 380 ${330 - i * 34}, 440 ${370 - i * 36}`}
            fill="none"
            stroke="#f2f2f2"
            strokeWidth={i % 4 === 0 ? 2.5 : 1}
            opacity={i % 4 === 0 ? 0.5 : 0.22}
          />
        ))}
        <path
          d="M0 520 L140 250 L230 380 L300 300 L400 520 Z"
          fill="#0b0b0b"
          opacity="0.55"
        />
      </svg>
    );
  }

  if (art === "race") {
    return (
      <svg
        viewBox="0 0 400 520"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
        aria-hidden="true"
      >
        <rect width="400" height="520" fill="#0b0b0b" />
        {Array.from({ length: 9 }, (_, i) => (
          <path
            key={i}
            d={`M${-120 + i * 78} 560 L${40 + i * 78} 200 L${86 + i * 78} 200 L${-74 + i * 78} 560 Z`}
            fill="#ff3d00"
            opacity={i % 2 === 0 ? 0.9 : 0.35}
          />
        ))}
        <rect y="0" width="400" height="200" fill="#0b0b0b" />
        <rect y="200" width="400" height="40" fill="#0b0b0b" />
        <g fill="#f2f2f2">
          {Array.from({ length: 20 }, (_, i) => (
            <rect
              key={i}
              x={(i % 10) * 40}
              y={200 + Math.floor(i / 10) * 20}
              width="20"
              height="20"
              transform={`translate(${(Math.floor(i / 10) % 2) * 20} 0)`}
            />
          ))}
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 400 520"
      preserveAspectRatio="xMidYMid slice"
      className="size-full"
      aria-hidden="true"
    >
      <rect width="400" height="520" fill="#1a1a1a" />
      <path d="M120 520 L175 120 L225 120 L280 520 Z" fill="#3a3a3a" />
      <g fill="#f2f2f2">
        {Array.from({ length: 7 }, (_, i) => {
          const t = i / 7;
          const y = 520 - i * 62 - 20;
          const h = 46 - i * 5;
          const w = 20 - i * 2;
          return (
            <rect
              key={i}
              x={200 - w / 2 + t * 0}
              y={y - h}
              width={w}
              height={h}
              rx="1"
            />
          );
        })}
      </g>
      <g stroke="#f2f2f2" strokeWidth="2" opacity="0.25">
        <path d="M0 400 H400" />
        <path d="M0 300 H400" />
        <path d="M0 220 H400" />
      </g>
      <circle cx="310" cy="118" r="52" fill="#ff3d00" opacity="0.9" />
    </svg>
  );
}

export default function CategoryTile({ terrain, delay = 0 }) {
  const reveal = useReveal({ delay });

  return (
    <a
      ref={reveal.ref}
      style={reveal.style}
      href="#lineup"
      className={`${reveal.className} group relative block aspect-[4/5] overflow-hidden bg-ink text-paper sm:aspect-[3/4]`}
    >
      <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transform-none">
        <TerrainArt art={terrain.art} />
      </div>

      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_top,rgba(11,11,11,0.9)_0%,rgba(11,11,11,0.35)_45%,rgba(11,11,11,0.05)_100%)]"
      />

      <div className="relative flex h-full flex-col justify-end p-6 sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-paper/70 uppercase">
          {terrain.count} styles
        </p>
        <h3 className="display mt-2 text-5xl sm:text-6xl">{terrain.name}</h3>
        <p className="mt-3 max-w-[26ch] text-sm text-paper/75">
          {terrain.blurb}
        </p>
        <span className="mt-6 inline-flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase">
          <span className="border-b-2 border-signal pb-1">
            Shop {terrain.name}
          </span>
          <ArrowIcon className="size-4 text-signal transition-transform duration-300 group-hover:translate-x-1.5" />
        </span>
      </div>
    </a>
  );
}
