import { perks } from "../data/catalog";
import { ClockIcon, ReturnIcon, ShipIcon } from "./Icons";
import { useReveal } from "../hooks/useReveal";

const perkIcons = {
  ship: ShipIcon,
  return: ReturnIcon,
  clock: ClockIcon,
};

function Perk({ perk, delay }) {
  const reveal = useReveal({ delay });
  const Icon = perkIcons[perk.icon];

  return (
    <div
      ref={reveal.ref}
      style={reveal.style}
      className={`${reveal.className} flex gap-4 bg-paper px-6 py-8 sm:px-8`}
    >
      <Icon className="size-7 shrink-0 text-signal" />
      <div>
        <dt className="text-xs font-bold tracking-[0.16em] uppercase">
          {perk.title}
        </dt>
        <dd className="mt-2 text-sm text-ink/60">{perk.copy}</dd>
      </div>
    </div>
  );
}

export default function Perks() {
  return (
    <section aria-label="Store benefits" className="bg-fog">
      <dl className="mx-auto grid max-w-[1600px] grid-cols-1 gap-px bg-ink/10 sm:grid-cols-3">
        {perks.map((perk, index) => (
          <Perk key={perk.title} perk={perk} delay={index * 100} />
        ))}
      </dl>
    </section>
  );
}
