/**
 * English-only string table. Replaces next-intl (removed 2026-09-12, D7).
 * Same call shape as before so call sites did not change:
 *   const t = useTranslations("Login"); t("signIn"); t("subtitle", { count })
 */
import en from "./strings.en.json";

type Namespace = keyof typeof en;
type Vars = Record<string, string | number>;

/**
 * Resolve a translation key from the static English catalog.
 *
 * The lookup mirrors the previous `next-intl` API semantics: if a key is
 * missing, the raw namespace/key tuple is returned so diagnostics remain clear.
 */
function lookup(ns: string, key: string, vars?: Vars): string {
  const table = (en as Record<string, Record<string, string>>)[ns];
  let s = table?.[key] ?? `${ns}.${key}`;

  // Variables are interpolated by placeholder name, which keeps the call shape
  // compatible with the older translation helper while staying pure and SSR-safe.
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }

  return s;
}

/**
 * Return a translation function scoped to a page or UI namespace.
 *
 * @param ns - Namespace name defined in `src/lib/strings.en.json`.
 * @returns A function that resolves keys and interpolates `{name}` placeholders.
 */
export function useTranslations(ns: Namespace) {
  return (key: string, vars?: Vars) => lookup(ns, key, vars);
}

/**
 * Resolve translations from the same catalog in async code paths.
 *
 * This preserves a stable API for server-only helpers that may need the
 * translation resolver in an async context without moving to a runtime
 * dependency such as `next-intl`.
 */
export async function getTranslations(ns: Namespace) {
  return (key: string, vars?: Vars) => lookup(ns, key, vars);
}
