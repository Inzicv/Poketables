// Vérification du parcours dans le navigateur.
// Usage : npm run build && npx next start -p 3100, puis node scripts/verify-game.cjs [url]
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const URL = process.argv[2] || "http://localhost:3100";
const SHOTS = path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (label, ok, extra = "") => { results.push({ label, ok }); console.log(`${ok ? "✓" : "✗"} ${label}${extra ? " · " + extra : ""}`); };

async function readQuestion(page) {
  const text = (await page.locator(".bubble span").textContent()).replace(/\s/g, "");
  const [a, b] = text.split("×").map(Number);
  return { a, b, answer: a * b };
}
async function typeOnKeypad(page, value) {
  for (const d of String(value)) await page.locator(".keypad button", { hasText: new RegExp(`^${d}$`) }).click();
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.clock.install();
  await page.goto(URL);
  await page.getByText("Multipliez-les tous !").waitFor();
  check("Accueil avec titre et tagline", await page.locator(".logo h1").textContent() === "Poketable");

  // Réglages : Ondine, tables 7 et 8, 10 s, toutes.
  await page.getByRole("radio", { name: "Ondine" }).click();
  await page.getByRole("button", { name: "Aucune" }).click();
  check("Jouer désactivé sans table", await page.getByRole("button", { name: /Partir à la chasse/ }).isDisabled());
  await page.locator(".table-chip", { hasText: /^table de7$/ }).click();
  await page.locator(".table-chip", { hasText: /^table de8$/ }).click();
  await page.getByRole("button", { name: "10 s" }).click();
  await page.getByRole("button", { name: /^Toutes \(20\)$/ }).click();
  await page.screenshot({ path: path.join(SHOTS, "home-1440.png"), fullPage: true });
  await page.getByRole("button", { name: /Partir à la chasse/ }).click();
  check("Partie de 20 Pokémon", (await page.locator(".counter").textContent()).includes("1 / 20"));

  // 1) Bonne réponse → coffre → Pokéball → capture.
  let q = await readQuestion(page);
  check("Question dans les tables 7 ou 8", [7, 8].includes(q.a) || [7, 8].includes(q.b), `${q.a} × ${q.b}`);
  check("Ouvrir désactivé si vide", await page.getByRole("button", { name: "Ouvrir le coffre" }).isDisabled());
  check("Ondine dans l'arène", await page.locator(".trainer-corner").getAttribute("alt") === "Ondine");
  await typeOnKeypad(page, q.answer);
  await page.screenshot({ path: path.join(SHOTS, "play-typed-1440.png") });
  await page.getByRole("button", { name: "Ouvrir le coffre" }).click();
  const ball = page.getByRole("button", { name: "Lancer la Pokéball" });
  check("Coffre ouvert, Pokéball visible", await ball.isVisible());
  check("Clavier retiré après validation", await page.locator(".keypad").count() === 0);
  await page.screenshot({ path: path.join(SHOTS, "play-open-1440.png") });
  await ball.click();
  await page.clock.runFor(800);
  await page.screenshot({ path: path.join(SHOTS, "play-throw-1440.png") });
  await page.clock.runFor(1300);
  check("Pokémon attrapé", (await page.locator(".wild-name").textContent()).includes("Tu as attrapé"));
  await page.screenshot({ path: path.join(SHOTS, "play-caught-1440.png") });
  await page.clock.runFor(2400);
  check("Question suivante automatique", (await page.locator(".counter").textContent()).includes("2 / 20"));
  const dex = await page.evaluate(() => JSON.parse(localStorage.getItem("poketable:pokedex:v1") || "{}"));
  check("Pokédex : 1 Pokémon enregistré", Object.keys(dex).length === 1);

  // 2) Mauvaise réponse au clavier physique.
  q = await readQuestion(page);
  const wrong = q.answer + 1;
  await page.keyboard.type(String(wrong));
  await page.keyboard.press("Enter");
  const fail = await page.locator(".chest-msg.fail").textContent();
  check("Mauvaise réponse : bonne réponse affichée", fail.includes(String(q.answer)) && fail.includes("Raté"));
  await page.keyboard.type("5");
  check("Code verrouillé après validation", (await page.locator(".screen").textContent()).includes(String(wrong)));
  await page.screenshot({ path: path.join(SHOTS, "play-wrong-1440.png") });
  await page.clock.runFor(3800);
  check("Suite après erreur", (await page.locator(".counter").textContent()).includes("3 / 20"));

  // 3) Temps écoulé.
  await page.clock.runFor(10_500);
  check("Temps écoulé", (await page.locator(".chest-msg.fail").textContent()).includes("Temps écoulé"));
  await page.screenshot({ path: path.join(SHOTS, "play-timeout-1440.png") });
  await page.clock.runFor(3800);

  // Affichages intermédiaire et mobile en cours de partie.
  for (const [w, h] of [[960, 800], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(50);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`Pas de débordement horizontal à ${w}px (partie)`, !overflow);
    await page.screenshot({ path: path.join(SHOTS, `play-${w}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Finir la partie rapidement (sans répondre → temps écoulé).
  for (let i = 0; i < 17; i++) { await page.clock.runFor(10_500); await page.clock.runFor(3800); }
  await page.getByText(/Tu as attrapé/).first().waitFor();
  check("Écran de fin : 1 sur 20", (await page.locator(".big-result").textContent()).includes("1") && (await page.locator(".big-result").textContent()).includes("20"));
  check("Liste « À réviser » présente", await page.locator(".miss-list li").count() > 0);
  await page.screenshot({ path: path.join(SHOTS, "end-1440.png"), fullPage: true });

  // Pokédex.
  await page.getByRole("button", { name: /Mon Pokédex/ }).click();
  check("Pokédex 1 / 297", (await page.locator(".counter").textContent()).trim() === "1 / 297");
  await page.screenshot({ path: path.join(SHOTS, "dex-1440.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  check("Pas de débordement à 390px (Pokédex)", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await page.screenshot({ path: path.join(SHOTS, "dex-390.png") });

  // Rechargement : réglages et Pokédex conservés.
  await page.reload();
  await page.getByText("Multipliez-les tous !").waitFor();
  check("Réglages conservés (Ondine)", await page.getByRole("radio", { name: "Ondine" }).getAttribute("aria-checked") === "true");
  check("Pokédex conservé", (await page.getByRole("button", { name: /Mon Pokédex/ }).textContent()).includes("1 / 297"));
  for (const w of [390, 960]) {
    await page.setViewportSize({ width: w, height: 844 });
    check(`Pas de débordement à ${w}px (accueil)`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
    await page.screenshot({ path: path.join(SHOTS, `home-${w}.png`), fullPage: true });
  }

  check("Console sans erreur", errors.length === 0, errors.join(" | "));
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? `\n${failed} vérification(s) en échec` : "\nTout est bon ✓");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
