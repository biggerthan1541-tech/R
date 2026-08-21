import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Reveals an element once it scrolls into view; skips straight to visible for
 * reduced-motion users and for browsers without IntersectionObserver.
 */
export function useReveal({ threshold = 0.15, delay = 0 } = {}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return {
    ref,
    className: shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
    style: {
      transition: `opacity 700ms ease, transform 700ms cubic-bezier(0.22,1,0.36,1)`,
      transitionDelay: `${delay}ms`,
    },
  };
}
