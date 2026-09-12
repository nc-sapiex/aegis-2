/**
 * English-only string table. Replaces next-intl (removed 2026-09-12, D7).
 * Same call shape as before so call sites did not change:
 *   const t = useTranslations("Login"); t("signIn"); t("subtitle", { count })
 */
import en from "./strings.en.json";

type Namespace = keyof typeof en;
type Vars = Record<string, string | number>;

function lookup(ns: string, key: string, vars?: Vars): string {
  const table = (en as Record<string, Record<string, string>>)[ns];
  let s = table?.[key] ?? `${ns}.${key}`;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useTranslations(ns: Namespace) {
  return (key: string, vars?: Vars) => lookup(ns, key, vars);
}

export async function getTranslations(ns: Namespace) {
  return (key: string, vars?: Vars) => lookup(ns, key, vars);
}
