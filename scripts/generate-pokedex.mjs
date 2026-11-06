import fs from "node:fs";
// Usage : node scripts/generate-pokedex.mjs  (régénère src/data/pokedex.ts)
// Format de scripts/data/pokemon-names.txt : "numéro Nom rang" (rang : b, 1, 2, L, M).
const [names, dir, out] = process.argv.length > 2 ? process.argv.slice(2) : ["scripts/data/pokemon-names.txt", "public/pokemon", "src/data/pokedex.ts"];
const tiers = { b: "base", 1: "evo1", 2: "evo2", L: "legend", M: "mythic" };
const files = Object.fromEntries(fs.readdirSync(dir).map(f => [Number(f.slice(0, 3)), f]));
const rows = fs.readFileSync(names, "utf8").trim().split("\n").map(line => {
  const parts = line.split(" "); const n = Number(parts[0]); const t = parts.at(-1); const name = parts.slice(1, -1).join(" ");
  if (!files[n]) throw new Error("no file " + n); if (!tiers[t]) throw new Error("tier " + line);
  return `  { number: ${n}, name: ${JSON.stringify(name)}, file: ${JSON.stringify(files[n])}, tier: "${tiers[t]}" },`;
});
if (rows.length !== Object.keys(files).length) throw new Error(`count ${rows.length} vs ${Object.keys(files).length}`);
fs.writeFileSync(out, `// Les ${rows.length} Pokémon du jeu, avec leur rang de rareté d'après leur vraie lignée.
// base : forme de base (et bébés) · evo1 : 1re évolution · evo2 : évolution finale
// legend : légendaires et fabuleux · mythic : Mew et Mewtwo, les plus rares de tous
export type Tier = "base" | "evo1" | "evo2" | "legend" | "mythic";
export type PokemonEntry = { number: number; name: string; file: string; tier: Tier };

export const pokedex: PokemonEntry[] = [
${rows.join("\n")}
];
`);
console.log(rows.length, "ok");
