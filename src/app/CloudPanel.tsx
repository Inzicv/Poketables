"use client";

import { useState } from "react";
import type { CloudSave } from "./useCloudSave";

type Mode = "idle" | "choose" | "restore";

export default function CloudPanel({ cloud }: { cloud: CloudSave }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [chosen, setChosen] = useState("");
  const [typed, setTyped] = useState("");

  const loadIdeas = async () => {
    setMode("choose");
    const list = await cloud.suggest();
    setIdeas(list);
    setChosen(list[0] ?? "");
  };

  if (cloud.nickname) return <section className="panel cloud" aria-label="Sauvegarde en ligne">
    <div className="cloud-head">
      <span className="cloud-icon" aria-hidden="true">☁️</span>
      <div>
        <h2>Ton pseudonyme : <strong className="nickname">{cloud.nickname}</strong></h2>
        <p>Ton Pokédex est sauvegardé tout seul. Sur un autre appareil, clique sur « J’ai déjà un pseudonyme » et tape-le.</p>
      </div>
    </div>
    <div className="cloud-actions">
      <button className="link-button" disabled={cloud.busy} onClick={cloud.leave}>Quitter cette sauvegarde</button>
      <button className="link-button danger-link" disabled={cloud.busy} onClick={() => {
        if (window.confirm(`Supprimer la sauvegarde en ligne « ${cloud.nickname} » ? Ton Pokédex restera sur cet appareil.`)) void cloud.remove();
      }}>Supprimer ma sauvegarde en ligne</button>
    </div>
    {cloud.status && <p className="cloud-status" role="status">{cloud.status}</p>}
  </section>;

  return <section className="panel cloud" aria-label="Sauvegarde en ligne">
    <div className="cloud-head">
      <span className="cloud-icon" aria-hidden="true">☁️</span>
      <div>
        <h2>Sauvegarde ton Pokédex</h2>
        <p>Choisis un pseudonyme rigolo pour retrouver tes Pokémon sur un autre appareil. Pas de mot de passe, pas de nom, pas d’e-mail.</p>
      </div>
    </div>

    {mode === "idle" && <div className="cloud-actions">
      <button className="secondary" disabled={cloud.busy} onClick={loadIdeas}>Choisir mon pseudonyme</button>
      <button className="link-button" onClick={() => setMode("restore")}>J’ai déjà un pseudonyme</button>
    </div>}

    {mode === "choose" && <div className="cloud-choose">
      <p className="cloud-label">Choisis ton pseudonyme :</p>
      <div className="nickname-options" role="radiogroup" aria-label="Pseudonymes proposés">
        {ideas.map(n => <button key={n} role="radio" aria-checked={chosen === n} className={`option nickname-option ${chosen === n ? "selected" : ""}`} onClick={() => setChosen(n)}>{n}</button>)}
        {!ideas.length && cloud.busy && <span className="cloud-label">Je cherche des idées…</span>}
      </div>
      <div className="cloud-actions">
        <button className="primary" disabled={cloud.busy || !chosen} onClick={async () => { if (await cloud.create(chosen)) setMode("idle"); else void loadIdeas(); }}>C’est mon pseudo !</button>
        <button className="link-button" disabled={cloud.busy} onClick={loadIdeas}>🔄 D’autres idées</button>
        <button className="link-button" onClick={() => setMode("idle")}>Annuler</button>
      </div>
    </div>}

    {mode === "restore" && <form className="cloud-choose" onSubmit={async e => { e.preventDefault(); if (await cloud.retrieve(typed)) setMode("idle"); }}>
      <label className="cloud-label" htmlFor="nickname-input">Ton pseudonyme, tout attaché :</label>
      <input id="nickname-input" className="nickname-input" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="pikachumalin" maxLength={40} value={typed} onChange={e => setTyped(e.target.value.replace(/\s/g, ""))} />
      <small className="cloud-hint">Les Pokémon déjà attrapés sur cet appareil seront ajoutés à ta sauvegarde.</small>
      <div className="cloud-actions">
        <button className="primary" type="submit" disabled={cloud.busy || typed.trim().length < 5}>Retrouver mon Pokédex</button>
        <button className="link-button" type="button" onClick={() => setMode("idle")}>Annuler</button>
      </div>
    </form>}

    {cloud.status && <p className="cloud-status" role="status">{cloud.status}</p>}
  </section>;
}
