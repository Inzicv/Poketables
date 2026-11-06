// Vérifie la sauvegarde en ligne avec un faux serveur en mémoire (aucun jeton Vercel nécessaire).
// Deux contextes de navigateur jouent le rôle de deux appareils.
// Usage : npx next start -p 3100, puis node scripts/verify-cloud.cjs [url]
const { chromium } = require("playwright");
const path = require("node:path");

const URL = process.argv[2] || "http://localhost:3100";
const SHOTS = path.join(__dirname, "shots");
const results = [];
const check = (label, ok, extra = "") => { results.push(ok); console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " · " + extra : ""}`); };

// --- Faux serveur ---
const store = new Map(); // nickname -> { etag, snapshot }
let version = 0;
const ideas = [["pikachumalin", "salamecheeclair", "tiploufrigolo"], ["evolicosmique", "mewdore", "roucoolrapide"]];
let ideaRound = 0;
function save(nickname, snapshot) { const entry = { etag: `"v${++version}"`, snapshot }; store.set(nickname, entry); return { nickname, ...entry }; }
async function fakeApi(route) {
  const req = route.request();
  const url = new globalThis.URL(req.url());
  const parts = url.pathname.replace(/^\/api\/save\/?/, "").split("/").filter(Boolean);
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  if (parts[0] === "suggest") return json(200, { nicknames: ideas[ideaRound++ % ideas.length] });
  if (!parts.length && req.method() === "POST") {
    if (store.has(body.nickname)) return json(409, { error: "Ce pseudonyme vient d’être pris." });
    return json(201, save(body.nickname, body.snapshot));
  }
  const nickname = parts[0];
  const entry = store.get(nickname);
  if (!entry) return json(404, { error: "Ce pseudonyme n’a pas été trouvé." });
  if (req.method() === "GET") return json(200, { nickname, ...entry });
  if (req.method() === "PUT") return body.etag === entry.etag ? json(200, save(nickname, body.snapshot)) : json(409, { error: "La sauvegarde a changé sur un autre appareil." });
  if (req.method() === "DELETE") { store.delete(nickname); return json(200, { deleted: true }); }
}

async function device(browser, pokedex, settings) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await context.route("**/api/save**", fakeApi);
  await context.addInitScript(([p, s]) => {
    if (!localStorage.getItem("poketable:init")) {
      localStorage.setItem("poketable:init", "1");
      localStorage.setItem("poketable:pokedex:v1", JSON.stringify(p));
      if (s) localStorage.setItem("poketable:settings:v1", JSON.stringify(s));
    }
  }, [pokedex, settings]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(URL);
  await page.getByText("Multipliez-les tous !").waitFor();
  return { page, errors };
}
const localDex = page => page.evaluate(() => JSON.parse(localStorage.getItem("poketable:pokedex:v1") || "{}"));
const keys = obj => Object.keys(obj).map(Number).sort((a, b) => a - b).join(",");
const waitFor = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };

(async () => {
  const browser = await chromium.launch();

  // Appareil A : crée sa sauvegarde en choisissant un pseudonyme.
  const A = await device(browser, { 1: 1, 4: 2 }, { tables: [2], seconds: 0, count: 10, trainer: "ondine" });
  await A.page.getByRole("button", { name: "Choisir mon pseudonyme" }).click();
  await A.page.getByRole("radio", { name: "salamecheeclair" }).waitFor();
  check("3 pseudonymes proposés", await A.page.locator(".nickname-option").count() === 3);
  await A.page.getByRole("button", { name: /D’autres idées/ }).click();
  await A.page.getByRole("radio", { name: "mewdore" }).waitFor();
  check("« D’autres idées » renouvelle les propositions", true);
  await A.page.getByRole("radio", { name: "mewdore" }).click();
  await A.page.screenshot({ path: path.join(SHOTS, "cloud-choose.png"), fullPage: true });
  await A.page.getByRole("button", { name: "C’est mon pseudo !" }).click();
  await A.page.locator(".nickname").waitFor();
  check("Pseudonyme choisi affiché", await A.page.locator(".nickname").textContent() === "mewdore");
  check("Sauvegarde créée avec le Pokédex de A", keys(store.get("mewdore").snapshot.pokedex) === "1,4");
  await A.page.screenshot({ path: path.join(SHOTS, "cloud-bound.png"), fullPage: true });

  // Appareil B : a déjà attrapé le n° 7, retrouve la sauvegarde → fusion.
  const B = await device(browser, { 7: 1 }, null);
  await B.page.getByRole("button", { name: "J’ai déjà un pseudonyme" }).click();
  await B.page.locator("#nickname-input").fill("mewdore");
  await B.page.getByRole("button", { name: "Retrouver mon Pokédex" }).click();
  await B.page.locator(".nickname").waitFor();
  check("B : Pokédex fusionné (1, 4, 7)", keys(await localDex(B.page)) === "1,4,7");
  check("B : réglages de la sauvegarde repris (Ondine)", await B.page.getByRole("radio", { name: "Ondine" }).getAttribute("aria-checked") === "true");
  check("Serveur : Pokédex fusionné renvoyé", await waitFor(() => keys(store.get("mewdore").snapshot.pokedex) === "1,4,7"));

  // A revient sur l'onglet → récupère le n° 7.
  await A.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  check("A : récupère le Pokémon de B au retour sur l’onglet", await waitFor(async () => keys(await localDex(A.page)) === "1,4,7"));

  // Conflit : un autre appareil sauvegarde le n° 9 pendant que A attrape un Pokémon.
  const before = store.get("mewdore");
  save("mewdore", { ...before.snapshot, pokedex: { ...before.snapshot.pokedex, 9: 1 } });
  await A.page.getByRole("button", { name: /Partir à la chasse/ }).click();
  const [a, b] = (await A.page.locator(".bubble span").textContent()).replace(/\s/g, "").split("×").map(Number);
  await A.page.keyboard.type(String(a * b));
  await A.page.keyboard.press("Enter");
  await A.page.getByRole("button", { name: "Lancer la Pokéball" }).click();
  await A.page.getByText(/Tu as attrapé/).waitFor();
  const caughtName = await A.page.locator(".wild-name b").textContent();
  const okConflict = await waitFor(() => { const d = store.get("mewdore").snapshot.pokedex; return d[9] === 1 && Object.keys(d).length >= 5; });
  check("Conflit : fusion sans perte (n° 9 gardé + nouvelle capture)", okConflict, `${caughtName} · serveur ${keys(store.get("mewdore").snapshot.pokedex)}`);
  check("A : le n° 9 arrive aussi en local", await waitFor(async () => (await localDex(A.page))[9] === 1));
  await A.page.getByRole("button", { name: "← Quitter" }).click().catch(() => {});

  // Hors ligne : le jeu reste jouable et le message est clair.
  await A.page.goto(URL);
  await A.page.getByText("Multipliez-les tous !").waitFor();
  await A.page.context().unroute("**/api/save**");
  await A.page.context().route("**/api/save**", r => r.abort());
  await A.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  check("Hors ligne : message clair", await waitFor(async () => /Pas de connexion/.test(await A.page.locator(".cloud-status").textContent().catch(() => ""))));
  await A.page.context().unroute("**/api/save**");
  await A.page.context().route("**/api/save**", fakeApi);

  // Quitter puis supprimer.
  await B.page.getByRole("button", { name: "Quitter cette sauvegarde" }).click();
  check("B : quitter garde la sauvegarde en ligne", store.has("mewdore") && await B.page.getByRole("button", { name: "Choisir mon pseudonyme" }).isVisible());
  check("B : Pokédex local conservé après avoir quitté", keys(await localDex(B.page)).startsWith("1,4,7"));
  A.page.once("dialog", d => d.accept());
  await A.page.getByRole("button", { name: "Supprimer ma sauvegarde en ligne" }).click();
  check("A : suppression en ligne", await waitFor(() => !store.has("mewdore")) && await A.page.getByRole("button", { name: "Choisir mon pseudonyme" }).isVisible());

  await A.page.setViewportSize({ width: 390, height: 844 });
  check("Pas de débordement à 390px", !(await A.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  const errors = [...A.errors, ...B.errors].filter(e => !/Failed to load resource|ERR_FAILED/.test(e));
  check("Console sans erreur", errors.length === 0, errors.join(" | "));
  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(failed ? `\n${failed} vérification(s) en échec` : "\nTout est bon ✓");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
