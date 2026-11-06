"use client";

import { useState } from "react";
import type { CloudSave } from "./useCloudSave";

type Mode = "idle" | "choose" | "restore";

export default function CloudPanel({ cloud, localCount }: { cloud: CloudSave; localCount: number }) {
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
        <h2>Joueur : <strong className="nickname">{cloud.nickname}</strong></h2>
        <p>Ton Pokédex est sauvegardé tout seul. Un frère, une sœur veut jouer ? Clique sur « Changer de joueur ».</p>
      </div>
    </div>
    {cloud.conflict ? <div className="cloud-actions">
      <button className="secondary" disabled={cloud.busy} onClick={() => void cloud.keepOnline()}>Reprendre le Pokédex en ligne</button>
      <button className="secondary" disabled={cloud.busy} onClick={() => {
        if (window.confirm("Garder le Pokédex de cet appareil ? Celui en ligne sera remplacé.")) void cloud.keepThisDevice();
      }}>Garder celui de cet appareil</button>
    </div> : <div className="cloud-actions">
      <button className="secondary" disabled={cloud.busy} onClick={() => void cloud.switchPlayer()}>👋 Changer de joueur</button>
      <button className="link-button danger-link" disabled={cloud.busy} onClick={() => {
        if (window.confirm(`Supprimer la sauvegarde en ligne « ${cloud.nickname} » ? Le Pokédex restera sur cet appareil.`)) void cloud.remove();
      }}>Supprimer ma sauvegarde en ligne</button>
    </div>}
    {cloud.status && <p className="cloud-status" role="status">{cloud.status}</p>}
  </section>;

  return <section className="panel cloud" aria-label="Sauvegarde en ligne">
    <div className="cloud-head">
      <span className="cloud-icon" aria-hidden="true">☁️</span>
      <div>
        <h2>Qui joue ?</h2>
        <p>Chaque enfant a son pseudonyme rigolo pour garder son Pokédex, même à plusieurs sur la même tablette. Pas de mot de passe, pas de nom, pas d’e-mail.</p>
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

    {mode === "restore" && <form className="cloud-choose" onSubmit={async e => {
      e.preventDefault();
      if (localCount && !window.confirm(`Les ${localCount} Pokémon de cet appareil ne sont dans aucune sauvegarde : ils seront remplacés par le Pokédex de « ${typed.trim().toLowerCase()} ». Continuer ?`)) return;
      if (await cloud.retrieve(typed)) { setMode("idle"); setTyped(""); }
    }}>
      <label className="cloud-label" htmlFor="nickname-input">Ton pseudonyme, tout attaché :</label>
      <input id="nickname-input" className="nickname-input" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="pikachumalin" maxLength={40} value={typed} onChange={e => setTyped(e.target.value.replace(/\s/g, ""))} />
      <small className="cloud-hint">Ton Pokédex et tes réglages s’afficheront sur cet appareil.</small>
      <div className="cloud-actions">
        <button className="primary" type="submit" disabled={cloud.busy || typed.trim().length < 5}>Retrouver mon Pokédex</button>
        <button className="link-button" type="button" onClick={() => setMode("idle")}>Annuler</button>
      </div>
    </form>}

    {cloud.status && <p className="cloud-status" role="status">{cloud.status}</p>}
  </section>;
}
