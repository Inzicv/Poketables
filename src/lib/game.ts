import { pokedex, type PokemonEntry, type Tier } from "@/data/pokedex";

// Poids d'apparition de CHAQUE Pokémon selon son rang : plus c'est petit, plus il est rare.
// Ex. : une forme de base sort 10/1,5 ≈ 7 fois plus souvent que Mew. Ajuster ici pour changer la rareté.
export const TIER_WEIGHTS: Record<Tier, number> = { base: 10, evo1: 6, evo2: 4, legend: 2.5, mythic: 1.5 };
// Un Pokémon pas encore capturé apparaît NEW_POKEMON_BOOST fois plus souvent : la collection avance.
export const NEW_POKEMON_BOOST = 3;

export const TIME_OPTIONS = [10, 15, 20, 30, 45, 60, 0] as const; // 0 = sans chrono
export const COUNT_OPTIONS = [10, 20, 0] as const; // 0 = toutes
export type Trainer = "sacha" | "ondine";
export type Settings = { tables: number[]; seconds: number; count: number; trainer: Trainer };
export const defaultSettings: Settings = { tables: [2, 3, 4, 5], seconds: 30, count: 10, trainer: "sacha" };

export type Question = { a: number; b: number; answer: number; pokemon: number };
export type Pokedex = Record<number, number>;

const SETTINGS_KEY = "poketable:settings:v1";
const POKEDEX_KEY = "poketable:pokedex:v1";

export function shuffled<T>(items: T[], random = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sanitizeSettings(value: unknown): Settings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Settings>;
  const tables = Array.isArray(raw.tables) ? [...new Set(raw.tables.filter(t => Number.isInteger(t) && t >= 1 && t <= 10))].sort((x, y) => x - y) : defaultSettings.tables;
  return {
    tables: tables.length ? tables : defaultSettings.tables,
    seconds: (TIME_OPTIONS as readonly number[]).includes(raw.seconds as number) ? raw.seconds as number : defaultSettings.seconds,
    count: (COUNT_OPTIONS as readonly number[]).includes(raw.count as number) ? raw.count as number : defaultSettings.count,
    trainer: raw.trainer === "ondine" ? "ondine" : "sacha",
  };
}

export const questionCount = (settings: Settings) => settings.count || settings.tables.length * 10;

/** Multiplications des tables choisies (T × 1 à T × 10), mélangées, dans un ordre d'affichage aléatoire. */
export function buildMultiplications(settings: Settings, random = Math.random) {
  const pool = settings.tables.flatMap(t => Array.from({ length: 10 }, (_, i) => ({ table: t, other: i + 1 })));
  const total = questionCount(settings);
  const list: { a: number; b: number }[] = [];
  let lastKey = "";
  while (list.length < total) {
    let round = shuffled(pool, random);
    const key = (p: { table: number; other: number }) => [p.table, p.other].sort((x, y) => x - y).join("x");
    if (round.length > 1 && key(round[0]) === lastKey) round = [...round.slice(1), round[0]];
    for (const item of round) {
      if (list.length >= total) break;
      list.push(random() < 0.5 ? { a: item.table, b: item.other } : { a: item.other, b: item.table });
      lastKey = key(item);
    }
  }
  return list;
}

/** Tire un Pokémon au hasard, pondéré par sa rareté (et boosté s'il n'est pas encore capturé). */
export function pickPokemon(caught: Pokedex, exclude: Set<number> = new Set(), random = Math.random): PokemonEntry {
  const pool = pokedex.length > exclude.size ? pokedex.filter(p => !exclude.has(p.number)) : pokedex;
  const weight = (p: PokemonEntry) => TIER_WEIGHTS[p.tier] * (caught[p.number] ? 1 : NEW_POKEMON_BOOST);
  let roll = random() * pool.reduce((sum, p) => sum + weight(p), 0);
  for (const p of pool) {
    roll -= weight(p);
    if (roll < 0) return p;
  }
  return pool[pool.length - 1];
}

export function buildRun(settings: Settings, caught: Pokedex, random = Math.random): Question[] {
  const used = new Set<number>();
  return buildMultiplications(settings, random).map(({ a, b }) => {
    const pokemon = pickPokemon(caught, used, random);
    used.add(pokemon.number);
    return { a, b, answer: a * b, pokemon: pokemon.number };
  });
}

function read(key: string): unknown {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export const loadSettings = () => sanitizeSettings(read(SETTINGS_KEY));
export const saveSettings = (settings: Settings) => write(SETTINGS_KEY, settings);
export function loadPokedex(): Pokedex {
  const raw = read(POKEDEX_KEY);
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => pokedex.some(p => p.number === Number(k)) && Number.isInteger(v) && (v as number) > 0)) as Pokedex;
}
export const savePokedex = (value: Pokedex) => write(POKEDEX_KEY, value);
