import { useState } from "react";
import { footerColumns } from "../data/catalog";
import {
  ArrowIcon,
  InstagramIcon,
  StravaIcon,
  XIcon,
  YouTubeIcon,
} from "./Icons";

const socials = [
  { label: "Instagram", Icon: InstagramIcon },
  { label: "X", Icon: XIcon },
  { label: "YouTube", Icon: YouTubeIcon },
  { label: "Strava", Icon: StravaIcon },
];

export default function Footer() {
  const [subscribed, setSubscribed] = useState(false);

  return (
    <footer id="footer" className="bg-ink text-paper">
      <div className="mx-auto max-w-[1600px] px-4 pt-16 pb-10 sm:px-6 lg:px-10 lg:pt-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <p className="display text-5xl leading-none sm:text-6xl">
              Velo<span className="text-signal">.</span>
            </p>
            <p className="mt-5 max-w-sm text-sm text-paper/60">
              Performance running, engineered around propulsion. Made-up brand,
              real opinions about heel drop.
            </p>

            <form
              className="mt-8 max-w-sm"
              onSubmit={(event) => {
                event.preventDefault();
                setSubscribed(true);
              }}
            >
              <label
                htmlFor="newsletter"
                className="text-[11px] font-semibold tracking-[0.2em] uppercase"
              >
                Get drop alerts
              </label>
              <div className="mt-3 flex border-b-2 border-paper/30 focus-within:border-signal">
                <input
                  id="newsletter"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="you@email.com"
                  className="w-full bg-transparent py-3 text-sm placeholder:text-paper/40 focus:outline-none"
                />
                <button
                  type="submit"
                  className="grid size-11 shrink-0 place-items-center text-signal transition-transform duration-300 hover:translate-x-1"
                  aria-label="Subscribe to drop alerts"
                >
                  <ArrowIcon className="size-5" />
                </button>
              </div>
              <p
                role="status"
                className={`mt-3 text-xs text-signal transition-opacity ${
                  subscribed ? "opacity-100" : "opacity-0"
                }`}
              >
                {subscribed ? "You are on the list. Drop 04 lands Friday." : "\u00a0"}
              </p>
            </form>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {footerColumns.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase">
                  {column.title}
                </h2>
                <ul className="mt-5 space-y-3">
                  {column.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#footer"
                        className="text-sm text-paper/60 transition-colors hover:text-signal"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-paper/15 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label htmlFor="region" className="sr-only">
                Region and language
              </label>
              <select
                id="region"
                defaultValue="us-en"
                className="border border-paper/25 bg-transparent px-3 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase hover:border-signal focus:outline-none"
              >
                <option value="us-en">United States — English</option>
                <option value="ca-en">Canada — English</option>
                <option value="ca-fr">Canada — Français</option>
                <option value="de-de">Deutschland — Deutsch</option>
                <option value="jp-ja">日本 — 日本語</option>
              </select>
            </div>

            <ul className="flex items-center gap-1">
              {socials.map(({ label, Icon }) => (
                <li key={label}>
                  <a
                    href="#footer"
                    aria-label={`VELO on ${label}`}
                    className="grid size-10 place-items-center text-paper/70 transition-colors hover:text-signal"
                  >
                    <Icon className="size-5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-paper/45">
            <p>© {new Date().getFullYear()} VELO — a fictional brand.</p>
            <a href="#footer" className="hover:text-signal">
              Privacy
            </a>
            <a href="#footer" className="hover:text-signal">
              Terms
            </a>
            <a href="#footer" className="hover:text-signal">
              Cookie settings
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
