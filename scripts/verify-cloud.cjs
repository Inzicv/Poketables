// Vérifie la sauvegarde en ligne avec un faux serveur en mémoire (aucun jeton Vercel nécessaire).
// Scénario : deux enfants sur la même tablette, plus un PC.
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
const ideas = [["pikachumalin", "salamecheeclair", "tiploufrigolo"], ["evolicosmique", "mewdore", "roucoolrapide"], ["pikachumalin", "goupixjoyeux", "abodore"]];
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

async function catchOne(page) {
  await page.getByRole("button", { name: /Partir à la chasse/ }).click();
  const [a, b] = (await page.locator(".bubble span").textContent()).replace(/\s/g, "").split("×").map(Number);
  await page.keyboard.type(String(a * b));
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Lancer la Pokéball" }).click();
  await page.getByText(/Tu as attrapé/).waitFor();
  const name = await page.locator(".wild-name b").textContent();
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "← Quitter" }).click();
  await page.getByText("Multipliez-les tous !").waitFor();
  return name;
}
const serverDex = nickname => keys(store.get(nickname)?.snapshot.pokedex ?? {});

(async () => {
  const browser = await chromium.launch();

  // --- Tablette partagée : Léa crée sa sauvegarde avec son Pokédex actuel.
  const T = await device(browser, { 1: 1, 4: 2 }, { tables: [2], seconds: 0, count: 10, trainer: "ondine" });
  await T.page.getByRole("button", { name: "Choisir mon pseudonyme" }).click();
  await T.page.getByRole("radio", { name: "salamecheeclair" }).waitFor();
  check("3 pseudonymes proposés", await T.page.locator(".nickname-option").count() === 3);
  await T.page.getByRole("button", { name: /D’autres idées/ }).click();
  await T.page.getByRole("radio", { name: "mewdore" }).click();
  await T.page.screenshot({ path: path.join(SHOTS, "cloud-choose.png"), fullPage: true });
  await T.page.getByRole("button", { name: "C’est mon pseudo !" }).click();
  await T.page.locator(".nickname").waitFor();
  check("Léa : pseudonyme choisi affiché", await T.page.locator(".nickname").textContent() === "mewdore");
  check("Léa : bandeau « Joueur » en haut", (await T.page.locator(".player-chip").textContent()).includes("mewdore"));
  check("Serveur : Pokédex de Léa (1, 4)", serverDex("mewdore") === "1,4");
  await catchOne(T.page);
  check("Serveur : capture de Léa sauvegardée", await waitFor(() => serverDex("mewdore").split(",").length === 3));
  const leaDex = serverDex("mewdore");
  await T.page.screenshot({ path: path.join(SHOTS, "cloud-bound.png"), fullPage: true });

  // Léa passe la main.
  await T.page.getByRole("button", { name: /Changer de joueur/ }).click();
  await T.page.getByRole("button", { name: "Choisir mon pseudonyme" }).waitFor();
  check("Changer de joueur : appareil vidé", keys(await localDex(T.page)) === "");
  check("Changer de joueur : sauvegarde de Léa intacte", serverDex("mewdore") === leaDex);
  check("Changer de joueur : réglages remis à zéro (Sacha)", await T.page.getByRole("radio", { name: "Sacha" }).getAttribute("aria-checked") === "true");

  // Tom crée la sienne sur la même tablette, part de zéro.
  await T.page.getByRole("button", { name: "Choisir mon pseudonyme" }).click();
  await T.page.getByRole("radio", { name: "pikachumalin" }).click();
  await T.page.getByRole("button", { name: "C’est mon pseudo !" }).click();
  await T.page.locator(".nickname").waitFor();
  check("Tom : sauvegarde vide au départ", serverDex("pikachumalin") === "");
  await catchOne(T.page);
  check("Tom : sa capture est chez lui", await waitFor(() => serverDex("pikachumalin").split(",").filter(Boolean).length === 1));
  check("Léa : rien de Tom chez elle", serverDex("mewdore") === leaDex);

  // Tom rend la tablette, Léa reprend son pseudonyme.
  await T.page.getByRole("button", { name: /Changer de joueur/ }).click();
  await T.page.getByRole("button", { name: "J’ai déjà un pseudonyme" }).click();
  await T.page.locator("#nickname-input").fill("mewdore");
  await T.page.getByRole("button", { name: "Retrouver mon Pokédex" }).click();
  await T.page.locator(".nickname").waitFor();
  check("Léa retrouve exactement son Pokédex (sans celui de Tom)", keys(await localDex(T.page)) === leaDex);
  check("Léa retrouve ses réglages (Ondine)", await T.page.getByRole("radio", { name: "Ondine" }).getAttribute("aria-checked") === "true");

  // --- PC avec un Pokédex non sauvegardé : retrouver « mewdore » le remplace, après confirmation.
  const P = await device(browser, { 7: 1 }, null);
  await P.page.getByRole("button", { name: "J’ai déjà un pseudonyme" }).click();
  await P.page.locator("#nickname-input").fill("mewdore");
  let asked = "";
  P.page.once("dialog", d => { asked = d.message(); d.accept(); });
  await P.page.getByRole("button", { name: "Retrouver mon Pokédex" }).click();
  await P.page.locator(".nickname").waitFor();
  check("PC : confirmation avant de remplacer", /1 Pokémon de cet appareil/.test(asked));
  check("PC : Pokédex remplacé, pas mélangé", keys(await localDex(P.page)) === leaDex);
  check("PC : copie de secours de l’ancien Pokédex", (await P.page.evaluate(() => localStorage.getItem("poketable:before-restore:v1") || "")).includes('"7":1'));

  // La tablette n'a rien de nouveau : au retour sur l'onglet, elle prend la version en ligne.
  const before = store.get("mewdore");
  save("mewdore", { ...before.snapshot, pokedex: { ...before.snapshot.pokedex, 9: 1 } });
  await T.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  check("Tablette : version en ligne reprise sans conflit", await waitFor(async () => (await localDex(T.page))[9] === 1));

  // Conflit : le PC attrape un Pokémon alors que la version en ligne a changé ailleurs.
  const mid = store.get("mewdore");
  save("mewdore", { ...mid.snapshot, pokedex: { ...mid.snapshot.pokedex, 12: 1 } });
  await catchOne(P.page);
  check("Conflit : la synchro s’arrête et demande", await waitFor(async () => await P.page.getByRole("button", { name: "Reprendre le Pokédex en ligne" }).isVisible()));
  await P.page.screenshot({ path: path.join(SHOTS, "cloud-conflict.png"), fullPage: true });
  check("Conflit : rien n’a été écrasé en ligne", store.get("mewdore").snapshot.pokedex[12] === 1);
  await P.page.getByRole("button", { name: "Reprendre le Pokédex en ligne" }).click();
  check("Conflit → version en ligne reprise telle quelle", await waitFor(async () => keys(await localDex(P.page)) === serverDex("mewdore")));
  const mid2 = store.get("mewdore");
  save("mewdore", { ...mid2.snapshot, pokedex: { ...mid2.snapshot.pokedex, 15: 1 } });
  await catchOne(P.page);
  await P.page.getByRole("button", { name: "Garder celui de cet appareil" }).waitFor();
  const pcDex = keys(await localDex(P.page));
  P.page.once("dialog", d => d.accept());
  await P.page.getByRole("button", { name: "Garder celui de cet appareil" }).click();
  check("Conflit → version de l’appareil envoyée telle quelle", await waitFor(() => serverDex("mewdore") === pcDex) && !store.get("mewdore").snapshot.pokedex[15]);

  // Hors ligne : impossible de changer de joueur tant que ce n'est pas sauvegardé.
  await P.page.context().unroute("**/api/save**");
  await P.page.context().route("**/api/save**", r => r.abort());
  await catchOne(P.page);
  await P.page.getByRole("button", { name: /Changer de joueur/ }).click();
  check("Hors ligne : changement de joueur refusé", await waitFor(async () => /pas encore sauvegardé/.test(await P.page.locator(".cloud-status").textContent().catch(() => ""))));
  check("Hors ligne : Pokédex gardé sur l’appareil", Object.keys(await localDex(P.page)).length > 0 && await P.page.locator(".nickname").isVisible());
  await P.page.context().unroute("**/api/save**");
  await P.page.context().route("**/api/save**", fakeApi);
  const pcAfter = keys(await localDex(P.page));
  await P.page.getByRole("button", { name: /Changer de joueur/ }).click();
  check("Réseau revenu : sauvegarde puis changement de joueur", await waitFor(async () => serverDex("mewdore") === pcAfter && keys(await localDex(P.page)) === ""));

  // Suppression.
  T.page.once("dialog", d => d.accept());
  await T.page.getByRole("button", { name: "Supprimer ma sauvegarde en ligne" }).click();
  const deleted = await waitFor(() => !store.has("mewdore"));
  check("Suppression en ligne", deleted && await waitFor(() => T.page.getByRole("button", { name: "Choisir mon pseudonyme" }).isVisible()), deleted ? "" : await T.page.locator(".cloud").innerText());

  await T.page.setViewportSize({ width: 390, height: 844 });
  check("Pas de débordement à 390px", !(await T.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  const errors = [...T.errors, ...P.errors].filter(e => !/Failed to load resource|ERR_FAILED/.test(e));
  check("Console sans erreur", errors.length === 0, errors.join(" | "));
  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(failed ? `\n${failed} vérification(s) en échec` : "\nTout est bon ✓");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
