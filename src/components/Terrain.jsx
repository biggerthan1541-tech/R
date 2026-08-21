import CategoryTile from "./CategoryTile";
import { terrains } from "../data/catalog";
import { useReveal } from "../hooks/useReveal";

export default function Terrain() {
  const reveal = useReveal();

  return (
    <section
      id="terrain"
      aria-labelledby="terrain-heading"
      className="scroll-mt-16 border-b border-ink/10 py-16 sm:scroll-mt-[72px] sm:py-24"
    >
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <div
          ref={reveal.ref}
          style={reveal.style}
          className={`${reveal.className} flex flex-wrap items-end justify-between gap-6`}
        >
          <div>
            <p className="text-[11px] font-semibold tracking-[0.24em] text-signal-ink uppercase">
              Pick your ground
            </p>
            <h2
              id="terrain-heading"
              className="display mt-3 text-5xl sm:text-6xl lg:text-7xl"
            >
              Shop by terrain
            </h2>
          </div>
          <p className="max-w-sm text-sm text-ink/60">
            Three surfaces, three completely different jobs for a midsole. Start
            where you actually run.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {terrains.map((terrain, index) => (
            <CategoryTile
              key={terrain.id}
              terrain={terrain}
              delay={index * 110}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
