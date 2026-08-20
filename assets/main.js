// Single source of truth for every CTA on the page — swap this one URL.
const BOOKING_URL = "https://cal.com/scrollstop-media/free-audit";

document.querySelectorAll("[data-book]").forEach((el) => {
  el.href = BOOKING_URL;
});

document.getElementById("year").textContent = new Date().getFullYear();

// Sticky nav border once scrolled
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 8);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// Mobile menu
const toggle = document.getElementById("nav-toggle");
const links = document.getElementById("nav-links");
const closeMenu = () => {
  links.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open menu");
};
toggle.addEventListener("click", () => {
  const open = links.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});
links.addEventListener("click", (e) => {
  if (e.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

// Video facade — the embed only loads after a click
const facade = document.querySelector(".video__facade");
facade.addEventListener("click", () => {
  const iframe = document.createElement("iframe");
  iframe.src = facade.dataset.embed;
  iframe.title = "Watch how it works";
  iframe.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  facade.replaceWith(iframe);
});

const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Reveal on scroll
const revealer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealer.unobserve(entry.target);
    });
  },
  { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

// Stat count-up
const format = (el, value) => {
  const decimals = Number(el.dataset.decimals || 0);
  return (el.dataset.prefix || "") + value.toFixed(decimals) + (el.dataset.suffix || "");
};

const counter = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      counter.unobserve(el);
      if (!motionOK) return;

      const target = Number(el.dataset.count);
      const duration = 1100;
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = format(el, target * eased);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  },
  { threshold: 0.5 }
);
document.querySelectorAll("[data-count]").forEach((el) => counter.observe(el));
