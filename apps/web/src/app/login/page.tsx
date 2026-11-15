"use client";

import { getJson, postJson } from "@/lib/client";
import { homeForRole } from "@/lib/ui";
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-black/40">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
          DineSense
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {mode === "pin" ? "Enter your PIN" : "Admin sign in"}
        </h1>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("pin");
              setPassword("");
              setError(null);
            }}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              mode === "pin" ? "bg-slate-800 text-white" : "text-slate-400"
            }`}
          >
            Staff PIN
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setPin("");
              setError(null);
            }}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              mode === "password" ? "bg-slate-800 text-white" : "text-slate-400"
            }`}
          >
            Admin password
          </button>
        </div>

        {mode === "pin" ? (
          <>
            <div className="mt-5 flex justify-center gap-3">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, index) => (
                <span
                  key={index}
                  className={`h-3.5 w-3.5 rounded-full ${
                    index < pin.length ? "bg-emerald-400" : "border border-slate-700"
                  }`}
                />
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => press(key)}
                  className={`rounded-xl py-4 text-xl font-semibold ${
                    key === "clear" || key === "back"
                      ? "bg-slate-800 text-slate-300"
                      : "bg-slate-800 text-white active:bg-slate-700"
                  }`}
                >
                  {key === "clear" ? "C" : key === "back" ? "⌫" : key}
                </button>
              ))}
            </div>

            {error ? (
              <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={pending || pin.length < 4}
              onClick={() => void submit()}
              className="mt-3 w-full rounded-xl bg-emerald-500 py-3.5 text-base font-semibold text-slate-950 disabled:opacity-40"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="mt-5 space-y-3"
          >
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              placeholder="Admin password"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg outline-none focus:border-emerald-500"
            />
            {error ? (
              <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending || password.length < 4}
              className="w-full rounded-xl bg-emerald-500 py-3.5 text-base font-semibold text-slate-950 disabled:opacity-40"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
