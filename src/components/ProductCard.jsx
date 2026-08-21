import { useState } from "react";
import { HeartIcon } from "./Icons";
import ShoeArt from "./ShoeArt";

const money = (value) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  });

export default function ProductCard({ product }) {
  const [favorite, setFavorite] = useState(false);

  return (
    <article className="group relative flex w-[78vw] shrink-0 snap-start flex-col sm:w-[46vw] lg:w-[24rem]">
      <div className="relative aspect-square overflow-hidden bg-fog">
        {product.badge && (
          <p className="absolute top-3 left-3 z-10 bg-signal px-2.5 py-1 text-[11px] font-bold tracking-[0.12em] text-ink uppercase">
            {product.badge}
          </p>
        )}

        <button
          type="button"
          onClick={() => setFavorite((value) => !value)}
          aria-pressed={favorite}
          aria-label={`${favorite ? "Remove" : "Add"} ${product.name} ${favorite ? "from" : "to"} favorites`}
          className="absolute top-2 right-2 z-10 grid size-10 place-items-center text-ink transition-colors hover:text-signal-ink"
        >
          <HeartIcon
            filled={favorite}
            className={`size-5 ${favorite ? "text-signal" : ""}`}
          />
        </button>

        <ShoeArt
          variant={product.art}
          className="size-full p-4 transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transform-none"
        />
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-ash uppercase">
            {product.category}
          </p>
          <h3 className="mt-1 text-base font-bold">
            <a
              href="#lineup"
              className="after:absolute after:inset-0 hover:text-signal-ink"
            >
              {product.name}
            </a>
          </h3>
        </div>
        <p className="shrink-0 text-right text-base font-bold">
          {product.wasPrice ? (
            <>
              <span className="text-signal-ink">{money(product.price)}</span>
              <span className="ml-2 text-sm font-medium text-ash line-through">
                {money(product.wasPrice)}
              </span>
            </>
          ) : (
            money(product.price)
          )}
        </p>
      </div>
    </article>
  );
}
