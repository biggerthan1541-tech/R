import { tickerTerms } from "../data/catalog";

function Row() {
  return (
    <>
      {tickerTerms.map((term) => (
        <span key={term} className="flex shrink-0 items-center">
          <span className="display px-6 text-3xl leading-none sm:px-9 sm:text-5xl lg:text-6xl">
            {term}
          </span>
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 bg-ink sm:size-3"
          />
        </span>
      ))}
    </>
  );
}

export default function Marquee() {
  return (
    <section
      aria-label="Brand ticker"
      className="overflow-hidden bg-signal text-ink"
    >
      {/* LED-panel scan lines */}
      <div className="relative py-4 sm:py-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:repeating-linear-gradient(0deg,transparent_0_2px,#0b0b0b_2px_3px)]"
        />
        <div className="animate-marquee flex w-max motion-reduce:animate-none">
          <div className="flex shrink-0 items-center">
            <Row />
          </div>
          <div className="flex shrink-0 items-center" aria-hidden="true">
            <Row />
          </div>
        </div>
      </div>
    </section>
  );
}
