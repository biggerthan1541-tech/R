import { heroStats } from "../data/catalog";
import { ArrowIcon } from "./Icons";
import ShoeArt from "./ShoeArt";
import SpeedStreaks from "./SpeedStreaks";
import { useReveal } from "../hooks/useReveal";

function SpecStat({ stat, className, delay }) {
  const reveal = useReveal({ delay, threshold: 0 });

  return (
    <div
      ref={reveal.ref}
      style={reveal.style}
      className={`${reveal.className} ${className} border-l-2 border-signal bg-paper/90 py-2 pl-3 backdrop-blur sm:py-3 sm:pl-4`}
    >
      <p className="display text-2xl leading-none sm:text-3xl">{stat.value}</p>
      <p className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-ink/60 uppercase sm:text-[11px]">
        {stat.label}
      </p>
      <p className="text-[10px] text-ash sm:text-[11px]">{stat.note}</p>
    </div>
  );
}

export default function Hero() {
  const copy = useReveal({ threshold: 0 });
  const art = useReveal({ threshold: 0, delay: 120 });

  return (
    <section
      id="top"
      aria-labelledby="hero-heading"
      className="relative flex min-h-[calc(100svh-104px)] scroll-mt-16 items-center overflow-hidden border-b border-ink/10 sm:scroll-mt-[72px]"
    >
      <SpeedStreaks />

      <div className="relative mx-auto grid w-full max-w-[1600px] grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:px-10 lg:py-20">
        <div
          ref={copy.ref}
          style={copy.style}
          className={`${copy.className} relative z-10`}
        >
          <p className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.24em] uppercase">
            <span
              className="inline-block h-2 w-6 bg-signal"
              aria-hidden="true"
            />
            Spring Drop 04
          </p>

          <h1
            id="hero-heading"
            className="display mt-5 text-[clamp(3rem,13vw,5.5rem)] lg:text-[min(7vw,8.5rem)]"
          >
            Outrun
            <br />
            Yester<span className="text-signal">day</span>
          </h1>

          <p className="mt-6 max-w-md text-base text-ink/70 sm:text-lg">
            Carbon-plated propulsion, race-day geometry, and a foam that gives
            back more than it takes. Built for the mile you have not run yet.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#lineup"
              className="group inline-flex items-center justify-center gap-3 bg-signal px-8 py-4 text-sm font-bold tracking-[0.14em] text-ink uppercase transition-colors hover:bg-ink hover:text-paper"
            >
              Shop the drop
              <ArrowIcon className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <a
              href="#tech"
              className="inline-flex items-center justify-center border-2 border-ink px-8 py-4 text-sm font-bold tracking-[0.14em] uppercase transition-colors hover:bg-ink hover:text-paper"
            >
              Explore the tech
            </a>
          </div>
        </div>

        <div
          ref={art.ref}
          style={art.style}
          className={`${art.className} relative mx-auto w-full max-w-2xl`}
        >
          <div className="relative aspect-[16/10] w-full">
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 aspect-square w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[14px] border-signal/12"
            />
            <ShoeArt
              variant="hero"
              className="absolute inset-x-0 top-1/2 h-[74%] w-full -translate-y-1/2"
            />
          </div>

          {/* stacked under the shoe on phones, floating over it from sm up */}
          <div className="mt-6 grid grid-cols-3 gap-2 sm:absolute sm:inset-0 sm:mt-0 sm:block">
            <SpecStat
              stat={heroStats[0]}
              delay={260}
              className="sm:absolute sm:top-0 sm:left-0"
            />
            <SpecStat
              stat={heroStats[1]}
              delay={360}
              className="sm:absolute sm:top-0 sm:right-0"
            />
            <SpecStat
              stat={heroStats[2]}
              delay={460}
              className="sm:absolute sm:bottom-0 sm:left-0"
            />
          </div>
        </div>
      </div>

      <p
        aria-hidden="true"
        className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 text-[10px] font-semibold tracking-[0.3em] text-ink/55 uppercase lg:block"
      >
        Scroll
      </p>
    </section>
  );
}
