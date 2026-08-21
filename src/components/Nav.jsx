import { useEffect, useRef, useState } from "react";
import { navLinks } from "../data/catalog";
import { BagIcon, CloseIcon, HeartIcon, MenuIcon, SearchIcon } from "./Icons";

const BAG_COUNT = 2;

function Logo({ className = "" }) {
  return (
    <a
      href="#top"
      className={`display text-2xl leading-none sm:text-3xl ${className}`}
      aria-label="VELO — home"
    >
      Velo
      <span className="text-signal" aria-hidden="true">
        .
      </span>
    </a>
  );
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const openButton = useRef(null);
  const closeButton = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // move focus into the drawer on open and hand it back on close, without
  // grabbing focus on the initial render
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      closeButton.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      openButton.current?.focus();
    }
  }, [open]);

  const iconButton =
    "grid size-10 place-items-center transition-colors hover:text-signal-ink";

  return (
    <>
      <header
        className={`sticky top-0 z-50 border-b bg-paper/95 backdrop-blur transition-[border-color,box-shadow] ${
          scrolled
            ? "border-ink/10 shadow-[0_1px_0_rgba(11,11,11,0.06)]"
            : "border-transparent"
        }`}
      >
        <nav
          aria-label="Primary"
          className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:h-[72px] sm:px-6 lg:px-10"
        >
          <div className="flex flex-1 items-center lg:flex-none">
            <button
              type="button"
              ref={openButton}
              className={`${iconButton} -ml-2 lg:hidden`}
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen(true)}
            >
              <MenuIcon className="size-6" />
            </button>
            <Logo className="ml-1 lg:ml-0" />
          </div>

          <ul className="hidden items-center gap-9 lg:flex">
            {navLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className={`group relative py-2 text-xs font-semibold tracking-[0.16em] uppercase transition-colors hover:text-signal-ink ${
                    link.label === "Sale" ? "text-signal-ink" : ""
                  }`}
                >
                  {link.label}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-0.5 h-0.5 origin-left scale-x-0 bg-signal transition-transform duration-300 group-hover:scale-x-100"
                  />
                </a>
              </li>
            ))}
          </ul>

          <div className="flex flex-1 items-center justify-end gap-0.5 lg:flex-none">
            <button type="button" className={iconButton} aria-label="Search">
              <SearchIcon className="size-5" />
            </button>
            <button
              type="button"
              className={`${iconButton} hidden sm:grid`}
              aria-label="Favorites"
            >
              <HeartIcon className="size-5" />
            </button>
            <button
              type="button"
              className={`${iconButton} relative -mr-2`}
              aria-label={`Bag, ${BAG_COUNT} items`}
            >
              <BagIcon className="size-5" />
              <span
                aria-hidden="true"
                className="absolute top-1 right-0.5 grid size-4 place-items-center bg-signal text-[10px] leading-none font-bold text-ink"
              >
                {BAG_COUNT}
              </span>
            </button>
          </div>
        </nav>
      </header>

      {/* rendered outside <header>: its backdrop-blur would trap position:fixed */}
      <div
        className={`fixed inset-0 z-[60] lg:hidden ${open ? "" : "pointer-events-none"}`}
        inert={!open}
      >
        <div
          className={`absolute inset-0 bg-ink/50 transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          role="presentation"
          onClick={() => setOpen(false)}
        />
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-paper transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-ink/10 px-4">
            <Logo />
            <button
              type="button"
              ref={closeButton}
              className={iconButton}
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <CloseIcon className="size-6" />
            </button>
          </div>
          <ul className="flex flex-col px-4 py-6">
            {navLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`display block border-b border-ink/10 py-5 text-4xl transition-colors hover:text-signal-ink ${
                    link.label === "Sale" ? "text-signal-ink" : ""
                  }`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center gap-6 border-t border-ink/10 px-4 py-5 text-xs font-semibold tracking-[0.16em] uppercase">
            <a href="#footer" className="hover:text-signal-ink">
              Account
            </a>
            <a href="#footer" className="hover:text-signal-ink">
              Favorites
            </a>
            <a href="#footer" className="hover:text-signal-ink">
              Help
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
