// Stockage serveur des sauvegardes (Vercel Blob privé). Nécessite BLOB_READ_WRITE_TOKEN.
import { randomInt } from "node:crypto";
import { get, put, del, BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";
import { pokedex } from "@/data/pokedex";
import { NICKNAME_PATTERN, sanitizeSnapshot, type CloudSnapshot } from "./cloud";

type Stored = { nickname: string; updatedAt: string; snapshot: CloudSnapshot };

export class SaveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const pathname = (nickname: string) => `saves/${nickname}.json`;
const NOT_FOUND = "Ce pseudonyme n’a pas été trouvé. Vérifie les lettres.";

export function nicknameOf(value: unknown) {
  const nickname = String(value ?? "").trim().toLowerCase();
  if (!NICKNAME_PATTERN.test(nickname)) throw new SaveError(400, "Vérifie ton pseudonyme : il est écrit tout attaché, sans accent.");
  return nickname;
}

export async function bodyOf(request: Request) {
  const text = await request.text();
  if (text.length > 100_000) throw new SaveError(413, "Cette sauvegarde est trop volumineuse.");
  try { return JSON.parse(text) as Record<string, unknown>; } catch { throw new SaveError(400, "La sauvegarde n’a pas pu être lue."); }
}

export function snapshotOf(value: unknown) {
  const snapshot = sanitizeSnapshot(value);
  if (!snapshot) throw new SaveError(400, "Sauvegarde manquante.");
  return snapshot;
}

export async function readSave(nickname: string) {
  try {
    // L'ETag de la représentation d'origine sert aux écritures conditionnelles.
    const result = await get(pathname(nickname), { access: "private", useCache: false, headers: { "Accept-Encoding": "identity" } });
    if (!result || result.statusCode !== 200) throw new SaveError(404, NOT_FOUND);
    const stored = await new Response(result.stream).json() as Stored;
    return { nickname, etag: result.blob.etag, snapshot: snapshotOf(stored.snapshot) };
  } catch (error) {
    if (error instanceof BlobNotFoundError) throw new SaveError(404, NOT_FOUND);
    throw error;
  }
}

async function isFree(nickname: string) {
  try { await readSave(nickname); return false; } catch (error) {
    if (error instanceof SaveError && error.status === 404) return true;
    throw error;
  }
}

// Pseudonymes façon Pokémon : un nom de Pokémon (sans accent) + un adjectif. Ex. : pikachumalin.
const names = [...new Set(pokedex.map(p => p.file.replace(/^\d+-/, "").replace(/\.webp$/, "").replace(/[^a-z]/g, "")))].filter(n => n.length >= 3 && n.length <= 14);
const words = ["bleu", "vert", "rose", "orange", "violet", "dore", "argent", "turquoise", "rapide", "malin", "joyeux", "rigolo", "magique", "etoile", "costaud", "farceur", "curieux", "brillant", "geant", "mignon", "cosmique", "eclair", "tonnerre", "soleil", "lune"];
const randomNickname = () => names[randomInt(names.length)] + words[randomInt(words.length)];

/** Propose `count` pseudonymes libres, différents les uns des autres. */
export async function suggestNicknames(count = 3) {
  const out = new Set<string>();
  for (let i = 0; i < 30 && out.size < count; i++) {
    const nickname = randomNickname();
    if (!out.has(nickname) && await isFree(nickname)) out.add(nickname);
  }
  if (!out.size) throw new SaveError(503, "Impossible de proposer un pseudonyme maintenant. Réessaie dans un instant.");
  return [...out];
}

export async function createSave(nickname: string, snapshot: CloudSnapshot) {
  try {
    await put(pathname(nickname), JSON.stringify({ nickname, snapshot, updatedAt: new Date().toISOString() } satisfies Stored), { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "application/json" });
  } catch (error) {
    if (/already exists/i.test(String(error))) throw new SaveError(409, "Ce pseudonyme vient d’être pris. Choisis-en un autre.");
    throw error;
  }
  return readSave(nickname);
}

export async function updateSave(nickname: string, snapshot: CloudSnapshot, etag: unknown) {
  if (typeof etag !== "string" || !etag) throw new SaveError(400, "Version de la sauvegarde manquante.");
  const current = await readSave(nickname);
  if (current.etag !== etag) throw new SaveError(409, "La sauvegarde a changé sur un autre appareil.");
  try {
    await put(pathname(nickname), JSON.stringify({ nickname, snapshot, updatedAt: new Date().toISOString() } satisfies Stored), { access: "private", addRandomSuffix: false, allowOverwrite: true, ifMatch: etag, contentType: "application/json" });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) throw new SaveError(409, "La sauvegarde a changé sur un autre appareil.");
    throw error;
  }
  return readSave(nickname);
}

export async function deleteSave(nickname: string) { await del(pathname(nickname)); }

export function failure(error: unknown) {
  if (!(error instanceof SaveError)) console.error(error);
  const message = error instanceof SaveError ? error.message : "La sauvegarde en ligne est momentanément indisponible. Ton Pokédex reste sur cet appareil.";
  return Response.json({ error: message }, { status: error instanceof SaveError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
