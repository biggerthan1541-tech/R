import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-6 py-16">
      <Wordmark eyebrow="Exception register" />
      <h3 className="mt-8 mb-1.5">Check your inbox</h3>
      <p className="text-[14px] text-neutral-700">
        We sent a sign-in link. It expires in 24 hours and works once.
      </p>
      <p className="mt-4 text-[14px]">
        <Link href="/login" className="text-accent-700 underline underline-offset-[3px] hover:text-accent">
          Use a different address
        </Link>
      </p>
    </main>
  );
}
