// Fonctions partagées client/serveur pour la sauvegarde en ligne.
import { sanitizeSettings, type Pokedex, type Settings } from "./game";

export type CloudSnapshot = { pokedex: Pokedex; settings: Settings };
export type Remote = { nickname: string; etag: string; snapshot: CloudSnapshot };

export const NICKNAME_PATTERN = /^[a-z0-9]{5,40}$/;

export function sanitizePokedex(value: unknown): Pokedex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Pokedex = {};
  for (const [key, count] of Object.entries(value)) {
    const n = Number(key);
    if (Number.isInteger(n) && n >= 1 && n <= 2000 && Number.isSafeInteger(count) && (count as number) > 0) out[n] = Math.min(count as number, 1_000_000);
  }
  return out;
}

export function sanitizeSnapshot(value: unknown): CloudSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<CloudSnapshot>;
  return { pokedex: sanitizePokedex(raw.pokedex), settings: sanitizeSettings(raw.settings) };
}

/** Fusionne deux Pokédex sans rien perdre : on garde chaque Pokémon, avec le plus grand nombre de captures. */
export function mergePokedex(a: Pokedex, b: Pokedex): Pokedex {
  const out: Pokedex = { ...a };
  for (const [key, count] of Object.entries(b)) out[Number(key)] = Math.max(out[Number(key)] ?? 0, count);
  return out;
}

export function samePokedex(a: Pokedex, b: Pokedex) {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => a[Number(k)] === b[Number(k)]);
}

export const sameSnapshot = (a: CloudSnapshot, b: CloudSnapshot) =>
  samePokedex(a.pokedex, b.pokedex) && JSON.stringify(sanitizeSettings(a.settings)) === JSON.stringify(sanitizeSettings(b.settings));
