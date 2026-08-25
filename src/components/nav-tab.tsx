"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header tab with the system's 3px accent underline on the active route. */
export function NavTab({ href, label, exact }: { href: string; label: string; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center px-4 text-[13px] font-extrabold uppercase tracking-[0.02em] transition-colors hover:text-accent ${
        active ? "text-ink shadow-[inset_0_-3px_0_var(--color-accent)]" : "text-neutral-600"
      }`}
    >
      {label}
    </Link>
  );
}
