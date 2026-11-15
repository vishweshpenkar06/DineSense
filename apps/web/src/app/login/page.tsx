"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "pin" ? { pin: value } : { password: value }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not sign in");
        return;
      }
      router.replace("/dev");
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/40">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
          DineSense
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Staff sign in</h1>
        <p className="mt-1 text-sm text-slate-400">
          Waiters, chefs and reception use a PIN. Admin uses a password.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("pin");
              setValue("");
            }}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              mode === "pin" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Staff PIN
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setValue("");
            }}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              mode === "password"
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Admin password
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-sm text-slate-300">
            {mode === "pin" ? "4–6 digit PIN" : "Password"}
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputMode={mode === "pin" ? "numeric" : "text"}
              type={mode === "pin" ? "password" : "password"}
              autoComplete="off"
              maxLength={mode === "pin" ? 6 : 200}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-lg tracking-widest outline-none focus:border-emerald-500"
              placeholder={mode === "pin" ? "••••" : "Your admin password"}
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || value.length === 0}
            className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-base font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

      </div>
    </main>
  );
}
