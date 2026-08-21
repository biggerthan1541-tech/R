import { useRef } from "react";
import { products } from "../data/catalog";
import { ChevronIcon } from "./Icons";
import ProductCard from "./ProductCard";
import { useReveal } from "../hooks/useReveal";

export default function Lineup() {
  const rail = useRef(null);
  const reveal = useReveal();

  const scrollBy = (direction) => {
    const node = rail.current;
    if (!node) return;
    const card = node.firstElementChild;
    const step = card
      ? card.getBoundingClientRect().width + 24
      : node.clientWidth * 0.8;
    node.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  const arrow =
    "grid size-11 place-items-center border-2 border-ink transition-colors hover:bg-ink hover:text-paper";

  return (
    <section
      id="lineup"
      aria-labelledby="lineup-heading"
      className="scroll-mt-16 border-b border-ink/10 py-16 sm:scroll-mt-[72px] sm:py-24"
    >
      <div
        ref={reveal.ref}
        style={reveal.style}
        className={`${reveal.className} mx-auto flex max-w-[1600px] flex-wrap items-end justify-between gap-6 px-4 sm:px-6 lg:px-10`}
      >
        <div>
          <p className="text-[11px] font-semibold tracking-[0.24em] text-signal-ink uppercase">
            New + Restocked
          </p>
          <h2
            id="lineup-heading"
            className="display mt-3 text-5xl sm:text-6xl lg:text-7xl"
          >
            The lineup
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#terrain"
            className="hidden text-xs font-bold tracking-[0.16em] uppercase underline decoration-signal decoration-2 underline-offset-8 hover:text-signal-ink sm:inline"
          >
            View all
          </a>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              className={arrow}
              aria-label="Scroll products left"
            >
              <ChevronIcon className="size-5 rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              className={arrow}
              aria-label="Scroll products right"
            >
              <ChevronIcon className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <ul
        ref={rail}
        tabIndex={0}
        aria-label="Product carousel"
        className="rail mt-10 flex snap-x snap-mandatory scroll-pl-4 gap-6 overflow-x-auto scroll-smooth px-4 pb-2 sm:scroll-pl-6 sm:px-6 lg:scroll-pl-10 lg:px-10"
      >
        {products.map((product) => (
          <li key={product.id} className="flex shrink-0 snap-start">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
