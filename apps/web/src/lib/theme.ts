export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "dinesense.theme";

export function defaultThemeForPath(pathname: string): ThemeMode {
  if (pathname.startsWith("/chef")) return "dark";
  if (pathname.startsWith("/reception") || pathname.startsWith("/admin")) return "light";
  return "system";
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "light" || mode === "dark") return mode;
  return systemPrefersDark ? "dark" : "light";
}
