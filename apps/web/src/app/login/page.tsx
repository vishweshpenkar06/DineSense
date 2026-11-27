"use client";

import { Brand, BrandMark } from "@/components/brand";
import { InstallApp } from "@/components/install-app";
import { getJson, postJson } from "@/lib/client";
import { homeForRole } from "@/lib/ui";
import { ArrowRight, ChefHat, Delete, KeyRound, Lock, Receipt, Timer, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    getJson<{ user: { role: string } }>("/api/auth/me")
      .then((data) => router.replace(homeForRole(data.user.role)))
      .catch(() => undefined);
  }, [router]);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const data = await postJson<{ user: { role: string } }>(
        "/api/auth/login",
        mode === "pin" ? { pin } : { password },
      );
      router.replace(homeForRole(data.user.role));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  }

  function press(key: string) {
    if (key === "clear") setPin("");
    else if (key === "back") setPin((value) => value.slice(0, -1));
    else setPin((value) => (value.length >= 6 ? value : value + key));
  }

  return (
    <main className="grid min-h-[100dvh] lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-12 lg:flex">
        <Brand />
        <div className="relative z-10 max-w-lg">
          <h1 className="mt-5 font-display text-[clamp(2.8rem,5vw,4.6rem)] font-medium leading-[1.02] tracking-[-0.03em] text-ink">
            Tables, orders
            <br />
            and bills. In sync.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            One quiet system for a busy room. Tables are watched, orders reach the
            kitchen, and every bill adds up without internet.
          </p>
          <div className="mt-10 grid gap-4 text-sm sm:grid-cols-3">
            {[
              { icon: Timer, label: "2-min table timer" },
              { icon: ChefHat, label: "Live kitchen board" },
              { icon: Receipt, label: "Bills without maths" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5 text-muted">
                <Icon className="h-4 w-4 text-accent" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-end justify-between text-xs text-faint">
          <span>Local-first · works on the restaurant Wi-Fi</span>
          <span className="flex items-center gap-2 text-accent/80">
            <BrandMark className="h-10 w-10" /> <span className="font-display text-lg">DS</span>
          </span>
        </div>
        <BrandMark className="pointer-events-none absolute -bottom-24 -right-24 h-[28rem] w-[28rem] text-accent/[0.045]" />
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-9 lg:hidden">
            <Brand />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-accent">Staff access</p>
          <h2 className="mt-3 font-display text-[2.1rem] font-medium leading-tight tracking-[-0.02em] text-ink">
            {mode === "pin" ? "Enter your PIN" : "Owner sign in"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {mode === "pin"
              ? "Waiters, chefs and reception use their 4–6 digit PIN."
              : "Use the password printed when the system was installed."}
          </p>

          <div className="mt-7 grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1">
            <button
              type="button"
              onClick={() => {
                setMode("pin");
                setPassword("");
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                mode === "pin" ? "bg-raised text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" /> Staff PIN
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("password");
                setPin("");
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                mode === "password" ? "bg-raised text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <Lock className="h-3.5 w-3.5" /> Admin password
            </button>
          </div>

          {mode === "pin" ? (
            <>
              <div className="mt-8 flex items-center justify-center gap-3">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, index) => (
                  <span
                    key={index}
                    className={`h-3 w-3 rounded-full transition ${
                      index < pin.length ? "bg-accent" : "border border-line bg-transparent"
                    }`}
                  />
                ))}
              </div>

              <div className="mt-7 grid grid-cols-3 gap-2.5">
                {KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => press(key)}
                    aria-label={key === "clear" ? "Clear PIN" : key === "back" ? "Delete last digit" : key}
                    className={`flex h-[3.6rem] items-center justify-center rounded-2xl border text-xl font-medium transition active:scale-[0.98] ${
                      key === "clear" || key === "back"
                        ? "border-line bg-surface text-muted hover:text-ink"
                        : "border-line bg-surface text-ink hover:border-accent/40 hover:bg-raised"
                    }`}
                  >
                    {key === "clear" ? <X className="h-5 w-5" /> : key === "back" ? <Delete className="h-5 w-5" /> : key}
                  </button>
                ))}
              </div>

              {error ? (
                <p className="mt-4 rounded-xl border border-coral/30 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                disabled={pending || pin.length < 4}
                onClick={() => void submit()}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-base font-semibold text-canvas transition hover:bg-[#efc05e] disabled:bg-raised disabled:text-faint disabled:hover:bg-raised"
              >
                {pending ? "Signing in…" : "Sign in"}
                {!pending ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              className="mt-8 space-y-3"
            >
              <label className="block text-sm text-muted">
                Password
                <input
                  autoFocus
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="off"
                  placeholder="Admin password"
                  className="mt-1.5 w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-base text-ink outline-none transition placeholder:text-faint focus:border-accent/60"
                />
              </label>
              {error ? (
                <p className="rounded-xl border border-coral/30 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={pending || password.length < 4}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-base font-semibold text-canvas transition hover:bg-[#efc05e] disabled:bg-raised disabled:text-faint disabled:hover:bg-raised"
              >
                {pending ? "Signing in…" : "Sign in"}
                {!pending ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </form>
          )}

          <InstallApp />

          <p className="mt-6 text-xs leading-relaxed text-faint">
            Staff PINs are created by the owner. On phones, connect to The Chinese Chef Wi-Fi and
            open the DineSense app.
          </p>
        </div>
      </section>
    </main>
  );
}
