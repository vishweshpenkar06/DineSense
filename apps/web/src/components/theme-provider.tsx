"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  defaultThemeForPath,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setThemeState(readStoredTheme() ?? defaultThemeForPath(window.location.pathname));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (readStoredTheme()) return;
    setThemeState(defaultThemeForPath(pathname));
  }, [pathname, ready]);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = resolveTheme(theme, media.matches);
      setResolvedTheme(next);
      document.documentElement.dataset.theme = next;
    };
    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, ready]);

  const setTheme = useCallback((next: ThemeMode) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

export function ThemeScript() {
  const script = `(function(){try{var key="dinesense.theme";var stored=localStorage.getItem(key);var path=location.pathname;var fallback=path.indexOf("/chef")===0?"dark":(path.indexOf("/reception")===0||path.indexOf("/admin")===0)?"light":"system";var mode=(stored==="light"||stored==="dark"||stored==="system")?stored:fallback;var system=window.matchMedia("(prefers-color-scheme: dark)").matches;var resolved=(mode==="light"||mode==="dark")?mode:(system?"dark":"light");document.documentElement.dataset.theme=resolved;}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
