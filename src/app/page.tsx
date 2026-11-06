"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pokedex, type PokemonEntry } from "@/data/pokedex";
import CloudPanel from "./CloudPanel";
import { useCloudSave, type CloudSave } from "./useCloudSave";
import type { CloudSnapshot } from "@/lib/cloud";
import {
  COUNT_OPTIONS, TIME_OPTIONS, buildRun, defaultSettings, loadPokedex, loadSettings, questionCount,
  sanitizeSettings, savePokedex, saveSettings, type Pokedex, type Question, type Settings, type Trainer,
} from "@/lib/game";

type Screen = "home" | "play" | "end" | "dex";
type Phase = "input" | "open" | "throw" | "caught" | "wrong" | "timeout";
type Outcome = { question: Question; caught: boolean; isNew: boolean; reason?: "wrong" | "timeout"; typed?: string };

const byNumber = new Map(pokedex.map(p => [p.number, p]));
const imageOf = (p: PokemonEntry) => `/pokemon/${p.file}`;
const trainerName: Record<Trainer, string> = { sacha: "Sacha", ondine: "Ondine" };
const isRare = (p: PokemonEntry) => p.tier === "legend" || p.tier === "mythic";

const CORRECT_DELAY = 2300;
const WRONG_DELAY = 3700;
const THROW_DURATION = 1900;

export default function Home() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [caught, setCaught] = useState<Pokedex>({});
  const [run, setRun] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [dexFrom, setDexFrom] = useState<Screen>("home");

  useEffect(() => {
    setSettings(loadSettings());
    setCaught(loadPokedex());
    setReady(true);
  }, []);
  useEffect(() => { if (ready) saveSettings(settings); }, [settings, ready]);

  const start = () => {
    setRun(buildRun(settings, caught));
    setIndex(0);
    setOutcomes([]);
    setScreen("play");
  };

  const finishQuestion = useCallback((outcome: Outcome) => {
    setOutcomes(old => [...old, outcome]);
    if (index + 1 < run.length) setIndex(index + 1);
    else setScreen("end");
  }, [index, run.length]);

  const registerCatch = useCallback((number: number) => {
    setCaught(old => ({ ...old, [number]: (old[number] ?? 0) + 1 }));
  }, []);
  useEffect(() => { if (ready) savePokedex(caught); }, [caught, ready]);

  const snapshot = useMemo<CloudSnapshot>(() => ({ pokedex: caught, settings }), [caught, settings]);
  const applyRemote = useCallback((value: CloudSnapshot) => { setCaught(value.pokedex); setSettings(sanitizeSettings(value.settings)); }, []);
  const cloud = useCloudSave(snapshot, applyRemote, ready);

  const openDex = (from: Screen) => { setDexFrom(from); setScreen("dex"); };

  if (!ready) return <main className="shell"><p className="loading">Chargement des Pokémon…</p></main>;

  return <main className="shell">
    {screen === "home" && <HomeScreen settings={settings} setSettings={setSettings} caughtCount={Object.keys(caught).length} cloud={cloud} onStart={start} onDex={() => openDex("home")} />}
    {screen === "play" && run[index] && <PlayScreen
      key={index}
      question={run[index]} index={index} total={run.length} settings={settings}
      alreadyCaught={!!caught[run[index].pokemon]}
      score={outcomes.filter(o => o.caught).length}
      onCatch={registerCatch} onDone={finishQuestion}
      onQuit={() => { if (window.confirm("Quitter la partie ? Les Pokémon déjà attrapés restent dans ton Pokédex.")) setScreen("home"); }}
    />}
    {screen === "end" && <EndScreen outcomes={outcomes} onReplay={start} onHome={() => setScreen("home")} onDex={() => openDex("end")} />}
    {screen === "dex" && <DexScreen caught={caught} onBack={() => setScreen(dexFrom)} onReset={() => {
      if (window.confirm("Effacer tout le Pokédex ? Tous les Pokémon attrapés seront perdus.")) setCaught({});
    }} />}
  </main>;
}

function Logo({ small }: { small?: boolean }) {
  return <div className={`logo ${small ? "logo-small" : ""}`}>
    <span className="logo-ball" aria-hidden="true" />
    <div><h1>Poke<span>table</span></h1>{!small && <p className="tagline">Multipliez-les tous !</p>}</div>
  </div>;
}

function HomeScreen({ settings, setSettings, caughtCount, cloud, onStart, onDex }: { settings: Settings; setSettings: (s: Settings) => void; caughtCount: number; cloud: CloudSave; onStart: () => void; onDex: () => void }) {
  const toggle = (t: number) => setSettings({ ...settings, tables: settings.tables.includes(t) ? settings.tables.filter(x => x !== t) : [...settings.tables, t].sort((a, b) => a - b) });
  const total = settings.tables.length ? questionCount(settings) : 0;
  return <section className="home screen-in">
    <Logo />
    {cloud.nickname && <p className="player-chip">🎮 Joueur : <b>{cloud.nickname}</b></p>}
    <div className="panel">
      <h2>Choisis ton dresseur</h2>
      <div className="trainers" role="radiogroup" aria-label="Dresseur">
        {(["sacha", "ondine"] as Trainer[]).map(t => <button key={t} role="radio" aria-checked={settings.trainer === t} className={`trainer-card ${settings.trainer === t ? "selected" : ""}`} onClick={() => setSettings({ ...settings, trainer: t })}>
          <img src={`/trainers/${t}.webp`} alt="" /><b>{trainerName[t]}</b>
        </button>)}
      </div>
    </div>
    <div className="panel">
      <div className="panel-head"><h2>Les tables</h2><div className="mini-actions">
        <button className="link-button" onClick={() => setSettings({ ...settings, tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })}>Toutes</button>
        <button className="link-button" onClick={() => setSettings({ ...settings, tables: [] })}>Aucune</button>
      </div></div>
      <div className="table-grid">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(t => <button key={t} className={`table-chip ${settings.tables.includes(t) ? "selected" : ""}`} aria-pressed={settings.tables.includes(t)} onClick={() => toggle(t)}>
          <small>table de</small><b>{t}</b>
        </button>)}
      </div>
      {!settings.tables.length && <p className="warning" role="status">Coche au moins une table pour jouer.</p>}
    </div>
    <div className="panel two-cols">
      <div>
        <h2>Temps pour ouvrir le coffre</h2>
        <div className="option-row">{TIME_OPTIONS.map(s => <button key={s} className={`option ${settings.seconds === s ? "selected" : ""}`} aria-pressed={settings.seconds === s} onClick={() => setSettings({ ...settings, seconds: s })}>{s ? `${s} s` : "Sans chrono"}</button>)}</div>
      </div>
      <div>
        <h2>Pokémon par partie</h2>
        <div className="option-row">{COUNT_OPTIONS.map(c => <button key={c} className={`option ${settings.count === c ? "selected" : ""}`} aria-pressed={settings.count === c} onClick={() => setSettings({ ...settings, count: c })}>{c || `Toutes (${settings.tables.length * 10})`}</button>)}</div>
      </div>
    </div>
    <div className="home-actions">
      <button className="primary" disabled={!settings.tables.length} onClick={onStart}>Partir à la chasse ! {total ? `(${total} Pokémon)` : ""}</button>
      <button className="secondary" onClick={onDex}>📖 Mon Pokédex · {caughtCount} / {pokedex.length}</button>
    </div>
    <CloudPanel cloud={cloud} localCount={caughtCount} />
  </section>;
}

function PlayScreen({ question, index, total, settings, alreadyCaught, score, onCatch, onDone, onQuit }: {
  question: Question; index: number; total: number; settings: Settings; alreadyCaught: boolean; score: number;
  onCatch: (n: number) => void; onDone: (o: Outcome) => void; onQuit: () => void;
}) {
  const pokemon = byNumber.get(question.pokemon)!;
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [remaining, setRemaining] = useState(settings.seconds * 1000);
  const [isNew] = useState(!alreadyCaught); // figé à l'apparition du Pokémon
  const ballRef = useRef<HTMLButtonElement>(null);
  const timed = settings.seconds > 0;

  // Chrono : ne descend que pendant la saisie et quand l'onglet est visible.
  useEffect(() => {
    if (!timed || phase !== "input") return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = document.hidden ? 0 : now - last;
      last = now;
      setRemaining(r => Math.max(0, r - delta));
    }, 100);
    return () => window.clearInterval(id);
  }, [timed, phase]);
  useEffect(() => { if (timed && phase === "input" && remaining <= 0) setPhase("timeout"); }, [timed, phase, remaining]);

  const submit = useCallback(() => {
    if (phase !== "input" || !typed) return;
    setPhase(Number(typed) === question.answer ? "open" : "wrong");
  }, [phase, typed, question.answer]);

  const press = useCallback((key: string) => {
    if (phase !== "input") return;
    if (key === "back") setTyped(t => t.slice(0, -1));
    else if (key === "ok") submit();
    else setTyped(t => (t.length < 3 ? (t === "0" ? key : t + key) : t));
  }, [phase, submit]);

  const throwBall = useCallback(() => {
    if (phase !== "open") return;
    setPhase("throw");
  }, [phase]);

  // Clavier physique.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter" && phase === "input") { e.preventDefault(); press("ok"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, phase]);

  useEffect(() => { if (phase === "open") ballRef.current?.focus(); }, [phase]);

  // Enchaînements automatiques.
  useEffect(() => {
    if (phase === "throw") {
      const id = window.setTimeout(() => { onCatch(pokemon.number); setPhase("caught"); }, THROW_DURATION);
      return () => window.clearTimeout(id);
    }
    if (phase === "caught") {
      const id = window.setTimeout(() => onDone({ question, caught: true, isNew }), CORRECT_DELAY);
      return () => window.clearTimeout(id);
    }
    if (phase === "wrong" || phase === "timeout") {
      const id = window.setTimeout(() => onDone({ question, caught: false, isNew: false, reason: phase, typed }), WRONG_DELAY);
      return () => window.clearTimeout(id);
    }
  }, [phase, onCatch, onDone, pokemon.number, question, isNew, typed]);

  const failed = phase === "wrong" || phase === "timeout";
  const percent = timed ? remaining / (settings.seconds * 1000) * 100 : 100;
  const rare = isRare(pokemon);

  return <section className="play screen-in">
    <div className="top-bar">
      <button className="link-button" onClick={onQuit}>← Quitter</button>
      <Logo small />
      <span className="counter" aria-label={`Pokémon ${index + 1} sur ${total}, ${score} attrapés`}><span className="counter-long">Pokémon </span>{index + 1} / {total} · <span className="mini-ball" aria-hidden="true" /> {score}</span>
    </div>
    {timed && <div className={`timer ${percent < 30 ? "timer-low" : ""}`} role="timer" aria-label={`${Math.ceil(remaining / 1000)} secondes restantes`}>
      <span style={{ width: `${percent}%` }} /><b>{phase === "input" ? `${Math.ceil(remaining / 1000)} s` : phase === "timeout" ? "0 s" : ""}</b>
    </div>}

    <div className={`arena ${rare ? "arena-rare" : ""}`}>
      {rare && <p className="rare-banner">{pokemon.tier === "mythic" ? "✨ Incroyable ! Un Pokémon ultra rare apparaît ! ✨" : "✨ Un Pokémon légendaire apparaît ! ✨"}</p>}
      <div className={`wild phase-${phase}`}>
        <div className="bubble" aria-live="polite"><span>{question.a} × {question.b}</span></div>
        <img className="wild-img" src={imageOf(pokemon)} alt={pokemon.name} width={180} height={180} />
        <div className="wild-shadow" />
        {(phase === "throw" || phase === "caught") && <span className="caught-ball" aria-hidden="true"><span className="pokeball" /></span>}
        {phase === "caught" && <span className="stars" aria-hidden="true">★ ★ ★</span>}
      </div>
      <div className="wild-name">{phase === "caught" ? <>Tu as attrapé <b>{pokemon.name}</b> !{isNew && <span className="new-badge">Nouveau !</span>}</> : <>Un <b>{pokemon.name}</b> sauvage {isNew ? "" : "(déjà dans ton Pokédex)"}</>}</div>
      <img className="trainer-corner" src={`/trainers/${settings.trainer}.webp`} alt={trainerName[settings.trainer]} />
      {phase === "throw" && <span className="flying-ball" aria-hidden="true"><span className="pokeball" /></span>}
    </div>

    <div className={`chest ${phase !== "input" && !failed ? "chest-open" : ""} ${failed ? "chest-fail" : ""}`}>
      <div className="chest-lid"><span className="chest-lock">{phase === "input" ? "🔒" : failed ? "🔒" : "🔓"}</span></div>
      <div className="chest-body">
        {phase === "open" ? <button ref={ballRef} className="ball-button" onClick={throwBall} aria-label="Lancer la Pokéball">
          <span className="pokeball big" /><b>Clique sur la Pokéball !</b>
        </button> : phase === "throw" || phase === "caught" ? <p className="chest-msg ok">✓ Code bon : {question.a} × {question.b} = {question.answer}</p> : <>
          <div className={`screen ${phase === "wrong" || phase === "timeout" ? "screen-wrong" : ""}`} aria-live="polite" aria-label="Code tapé">
            {phase === "input" ? <>{typed.padEnd(3, "·").split("").map((d, i) => <span key={i} className={d === "·" ? "dim" : ""}>{d === "·" ? "_" : d}</span>)}</> : <span>✗ {typed || "—"}</span>}
          </div>
          {failed ? <p className="chest-msg fail" role="status">{phase === "timeout" ? "⏰ Temps écoulé ! " : "Raté ! "}Le code était <b>{question.answer}</b> ({question.a} × {question.b} = {question.answer}). {pokemon.name} s’enfuit…</p> :
            <div className="keypad" aria-label="Clavier du coffre">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(k => <button key={k} onClick={() => press(k)}>{k}</button>)}
              <button className="key-back" onClick={() => press("back")} aria-label="Effacer">⌫</button>
              <button onClick={() => press("0")}>0</button>
              <button className="key-ok" disabled={!typed} onClick={() => press("ok")} aria-label="Ouvrir le coffre">✓</button>
            </div>}
        </>}
      </div>
    </div>
    <p className="footnote">{phase === "input" ? "Tape le résultat pour ouvrir le coffre." : phase === "open" ? "Le coffre est ouvert !" : "La suite arrive…"}</p>
  </section>;
}

function EndScreen({ outcomes, onReplay, onHome, onDex }: { outcomes: Outcome[]; onReplay: () => void; onHome: () => void; onDex: () => void }) {
  const wins = outcomes.filter(o => o.caught);
  const misses = outcomes.filter(o => !o.caught);
  const uniqueMisses = useMemo(() => {
    const seen = new Set<string>();
    return misses.filter(o => { const k = `${o.question.a}x${o.question.b}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }, [misses]);
  return <section className="end screen-in">
    <Logo small />
    <div className="panel center">
      <p className="big-result">Tu as attrapé <b>{wins.length}</b> Pokémon sur {outcomes.length} !</p>
      {wins.length === outcomes.length && outcomes.length > 0 && <p className="perfect">🏆 Sans faute ! Tu es un vrai Maître des tables !</p>}
      {wins.length > 0 && <div className="catch-row">{wins.map((o, i) => { const p = byNumber.get(o.question.pokemon)!; return <figure key={i}><img src={imageOf(p)} alt="" /><figcaption>{p.name}{o.isNew && <span className="new-badge">Nouveau</span>}</figcaption></figure>; })}</div>}
    </div>
    {uniqueMisses.length > 0 && <div className="panel">
      <h2>À réviser</h2>
      <ul className="miss-list">{uniqueMisses.map((o, i) => <li key={i}><b>{o.question.a} × {o.question.b} = {o.question.answer}</b><small>{o.reason === "timeout" ? "temps écoulé" : `tu as tapé ${o.typed}`}</small></li>)}</ul>
    </div>}
    <div className="home-actions">
      <button className="primary" onClick={onReplay}>Rejouer</button>
      <button className="secondary" onClick={onHome}>Réglages</button>
      <button className="secondary" onClick={onDex}>📖 Mon Pokédex</button>
    </div>
  </section>;
}

function DexScreen({ caught, onBack, onReset }: { caught: Pokedex; onBack: () => void; onReset: () => void }) {
  const [filter, setFilter] = useState<"all" | "caught" | "missing">("all");
  const count = Object.keys(caught).length;
  const list = pokedex.filter(p => filter === "all" || (filter === "caught") === !!caught[p.number]);
  return <section className="dex screen-in">
    <div className="top-bar"><button className="link-button" onClick={onBack}>← Retour</button><Logo small /><span className="counter">{count} / {pokedex.length}</span></div>
    <div className="panel">
      <div className="panel-head"><h2>Mon Pokédex</h2>
        <div className="option-row">{([["all", "Tous"], ["caught", "Attrapés"], ["missing", "Manquants"]] as const).map(([k, label]) => <button key={k} className={`option ${filter === k ? "selected" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}</div>
      </div>
      <div className="dex-progress"><span style={{ width: `${count / pokedex.length * 100}%` }} /></div>
      {!list.length && <p className="empty">{filter === "caught" ? "Aucun Pokémon pour l’instant. Pars à la chasse !" : "Bravo, tu les as tous attrapés !"}</p>}
      <ul className="dex-grid">{list.map(p => {
        const n = caught[p.number];
        return <li key={p.number} className={`dex-card ${n ? "" : "missing"} ${isRare(p) ? "rare" : ""}`}>
          <img src={imageOf(p)} alt={n ? p.name : "Pokémon inconnu"} loading="lazy" width={96} height={96} />
          <small>n° {String(p.number).padStart(3, "0")}</small>
          <b>{n ? p.name : "?"}</b>
          {n ? <span className="dex-count">×{n}</span> : null}
        </li>;
      })}</ul>
    </div>
    {count > 0 && <button className="danger" onClick={onReset}>Effacer le Pokédex</button>}
  </section>;
}
