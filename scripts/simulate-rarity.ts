// Simule 100 000 apparitions pour vérifier les taux de rareté. Usage : npx tsx scripts/simulate-rarity.ts
import { pokedex } from "../src/data/pokedex";
import { pickPokemon, buildMultiplications, sanitizeSettings } from "../src/lib/game";
const N = 100_000; const counts: Record<string, number> = {}; let mew = 0, mewtwo = 0;
for (let i = 0; i < N; i++) { const p = pickPokemon({}); counts[p.tier] = (counts[p.tier] ?? 0) + 1; if (p.number === 151) mew++; if (p.number === 150) mewtwo++; }
for (const [t, c] of Object.entries(counts)) console.log(t.padEnd(7), (c / N * 100).toFixed(2) + " %");
console.log("Mew", (mew / N * 100).toFixed(2) + " %", "· Mewtwo", (mewtwo / N * 100).toFixed(2) + " %");
const per = (t: string) => counts[t] / N / pokedex.filter(p => p.tier === t).length;
console.log("Chance d'UN Pokémon précis :", ["base", "evo1", "evo2", "legend", "mythic"].map(t => `${t} ${(per(t) * 100).toFixed(3)} %`).join(" · "));
console.log("En parties de 10 : un légendaire tous les", (1 / (counts.legend / N) / 10).toFixed(1), "parties · Mew ou Mewtwo tous les", (1 / (counts.mythic / N) / 10).toFixed(0), "parties (Pokédex vide)");
const s = sanitizeSettings({ tables: [7, 8], count: 0, seconds: 10 }); const m = buildMultiplications(s);
console.log("tables 7,8 toutes :", m.length, "questions, toutes valides :", m.every(q => [7, 8].includes(q.a) || [7, 8].includes(q.b)), "· doublons :", new Set(m.map(q => [q.a, q.b].sort().join("x"))).size !== m.length ? "oui (7x8 et 8x7)" : "non");
const s2 = sanitizeSettings({ tables: [3], count: 20 }); const m2 = buildMultiplications(s2);
let rep = 0; for (let i = 1; i < m2.length; i++) if (m2[i].a * m2[i].b === m2[i - 1].a * m2[i - 1].b && Math.min(m2[i].a, m2[i].b) === Math.min(m2[i-1].a, m2[i-1].b)) rep++;
console.log("table 3, 20 questions :", m2.length, "· répétitions consécutives :", rep);
