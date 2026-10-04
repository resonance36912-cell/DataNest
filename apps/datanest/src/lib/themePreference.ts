export const THEME_PREFERENCES = ["dark", "light", "system"] as const;
export type ThemePreference = typeof THEME_PREFERENCES[number];
export type ResolvedTheme = "dark" | "light";
export const THEME_STORAGE_KEY = "datanest-theme";

export function normalizeThemePreference(value:unknown):ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)?value as ThemePreference:"system";
}

export function resolveTheme(preference:ThemePreference,prefersDark:boolean):ResolvedTheme {
  return preference==="system"?(prefersDark?"dark":"light"):preference;
}
