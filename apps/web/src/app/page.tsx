import Link from "next/link";
import { redirect } from "next/navigation";
import { readSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await readSessionUser();
  if (user) redirect("/dev");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
          DineSense · Phase 1
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Every table noticed. Every order on time.
        </h1>
        <p className="max-w-xl text-lg text-slate-400">
          The core engine is running: table state machine, the 3-minute decision timer,
          waiter tasks, vision event ingestion and live updates — all on this machine,
          with no internet needed.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-emerald-500 px-5 py-3 text-base font-semibold text-slate-950 hover:bg-emerald-400"
        >
          Sign in
        </Link>
        <span className="text-sm text-slate-500">
          Staff PINs are created by the owner. Development seeds are in the README.
        </span>
      </div>
    </main>
  );
}
