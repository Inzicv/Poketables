// Vérifie que chaque image a son entrée dans le Pokédex, et inversement.
import fs from "node:fs";
const src = fs.readFileSync("src/data/pokedex.ts", "utf8");
const files = new Set(fs.readdirSync("public/pokemon"));
const entries = [...src.matchAll(/file: "([^"]+)", tier: "(\w+)"/g)];
const listed = new Set(entries.map(m => m[1]));
const missing = [...listed].filter(f => !files.has(f));
const orphans = [...files].filter(f => !listed.has(f));
const tiers = entries.reduce((acc, m) => ({ ...acc, [m[2]]: (acc[m[2]] ?? 0) + 1 }), {});
console.log(`${entries.length} Pokémon`, tiers);
if (missing.length) console.error("Images manquantes :", missing);
if (orphans.length) console.error("Images sans entrée :", orphans);
process.exit(missing.length || orphans.length ? 1 : 0);
