import { ArrowIcon } from "./Icons";
import { useReveal } from "../hooks/useReveal";

const specs = [
  ["Plate", "Full-length unidirectional carbon"],
  ["Foam", "PEBA supercritical, 87% return"],
  ["Stack", "38mm heel / 32mm forefoot"],
];

function PlateDiagram() {
  return (
    <svg
      viewBox="0 0 600 420"
      className="h-full w-full p-6 sm:p-10"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {/* energy returned on toe-off, growing toward the front of the shoe */}
      <g stroke="#ff3d00" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M150 186 V96" />
        <path d="M150 96 l-16 22 M150 96 l16 22" />
        <path d="M300 194 V62" />
        <path d="M300 62 l-16 22 M300 62 l16 22" />
        <path d="M450 206 V34" />
        <path d="M450 34 l-16 22 M450 34 l16 22" />
      </g>

      {/* midsole cutaway: two foam densities with the plate on the seam */}
      <path
        d="M72 250 C50 268 56 292 88 300 L450 300 C500 299 530 278 540 254 C544 242 530 236 516 244 L78 246 Z"
        fill="#8a8a8a"
      />
      <path
        d="M66 196 C48 212 50 244 76 252 L440 262 C496 262 534 246 542 232 C545 220 528 214 512 222 L70 192 Z"
        fill="#f2f2f2"
      />
      <path
        d="M74 252 C170 274 320 278 418 266 C474 258 516 248 538 240"
        fill="none"
        stroke="#ff3d00"
        strokeWidth="14"
        strokeLinecap="round"
      />

      {/* legend */}
      <g
        fill="#f2f2f2"
        fontFamily="Inter, sans-serif"
        fontSize="14"
        fontWeight="600"
        letterSpacing="2.5"
      >
        <rect x="72" y="356" width="26" height="8" fill="#ff3d00" />
        <text x="110" y="366">
          CARBON PLATE
        </text>
        <rect x="290" y="356" width="26" height="8" fill="#f2f2f2" />
        <text x="328" y="366">
          PEBA FOAM
        </text>
      </g>
    </svg>
  );
}

export default function Editorial() {
  const art = useReveal();
  const copy = useReveal({ delay: 120 });

  return (
    <section
      id="tech"
      aria-labelledby="tech-heading"
      className="grid scroll-mt-16 grid-cols-1 border-b border-ink/10 sm:scroll-mt-[72px] lg:grid-cols-2"
    >
      <div
        ref={art.ref}
        style={art.style}
        className={`${art.className} relative flex aspect-[4/3] items-center justify-center bg-ink [background-image:repeating-linear-gradient(0deg,transparent_0_49px,rgba(242,242,242,0.09)_49px_50px),repeating-linear-gradient(90deg,transparent_0_49px,rgba(242,242,242,0.09)_49px_50px)] lg:aspect-auto lg:min-h-[42rem]`}
      >
        <PlateDiagram />
        <p className="absolute bottom-5 left-5 text-[11px] font-semibold tracking-[0.2em] text-paper/50 uppercase">
          Fig. 01 — Propulsion path
        </p>
      </div>

      <div
        ref={copy.ref}
        style={copy.style}
        className={`${copy.className} flex flex-col justify-center px-4 py-16 sm:px-10 lg:px-16 lg:py-24`}
      >
        <p className="text-[11px] font-semibold tracking-[0.24em] text-signal-ink uppercase">
          The tech
        </p>
        <h2
          id="tech-heading"
          className="display mt-4 max-w-[14ch] text-5xl sm:text-6xl lg:text-7xl"
        >
          The plate does the pushing
        </h2>
        <p className="mt-6 max-w-lg text-base text-ink/70 sm:text-lg">
          A full-length carbon plate is suspended between two densities of
          supercritical foam. Compress it on landing and it stores the load;
          roll through midstance and it snaps flat again, aiming that energy
          forward instead of down.
        </p>
        <p className="mt-4 max-w-lg text-base text-ink/70">
          The result is a stiffer toe-off with a softer landing — the two things
          a running shoe usually has to trade against each other.
        </p>

        <dl className="mt-10 grid grid-cols-1 gap-px border border-ink/10 bg-ink/10 sm:grid-cols-3">
          {specs.map(([term, value]) => (
            <div key={term} className="bg-paper p-5">
              <dt className="text-[11px] font-semibold tracking-[0.16em] text-ash uppercase">
                {term}
              </dt>
              <dd className="mt-2 text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>

        <a
          href="#lineup"
          className="group mt-10 inline-flex w-fit items-center gap-3 border-b-2 border-signal pb-2 text-sm font-bold tracking-[0.14em] uppercase hover:text-signal-ink"
        >
          Read the engineering notes
          <ArrowIcon className="size-4 text-signal transition-transform duration-300 group-hover:translate-x-1.5" />
        </a>
      </div>
    </section>
  );
}
