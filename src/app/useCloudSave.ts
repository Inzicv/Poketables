"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultSettings } from "@/lib/game";
import { sameSnapshot, sanitizeSnapshot, type CloudSnapshot, type Remote } from "@/lib/cloud";

type Binding = { nickname: string; etag: string; synced: CloudSnapshot };
const BINDING_KEY = "poketable:cloud:v1";
const BACKUP_KEY = "poketable:before-restore:v1";
const emptySnapshot = (): CloudSnapshot => ({ pokedex: {}, settings: defaultSettings });

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/save${path}`, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...options?.headers } });
  } catch {
    throw new RequestError(0, "Pas de connexion : ton Pokédex reste sur cet appareil, il sera sauvegardé au retour du réseau.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(response.status, result.error ?? "La sauvegarde en ligne est momentanément indisponible.");
  return result as T;
}

function readBinding(): Binding | null {
  try {
    const raw = JSON.parse(localStorage.getItem(BINDING_KEY) ?? "null");
    const synced = sanitizeSnapshot(raw?.synced);
    return raw && typeof raw.nickname === "string" && typeof raw.etag === "string" && synced ? { nickname: raw.nickname, etag: raw.etag, synced } : null;
  } catch { return null; }
}
function writeBinding(binding: Binding | null) {
  try { if (binding) localStorage.setItem(BINDING_KEY, JSON.stringify(binding)); else localStorage.removeItem(BINDING_KEY); } catch { /* stockage indisponible */ }
}

const messageOf = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

/**
 * Sauvegarde en ligne par pseudonyme, un pseudonyme par enfant.
 * - Le Pokédex de l'appareil est envoyé après chaque changement.
 * - Retrouver un pseudonyme REMPLACE le Pokédex de l'appareil (jamais de mélange entre frères et sœurs).
 * - « Changer de joueur » sauvegarde d'abord, puis vide l'appareil pour l'enfant suivant.
 * - Si le même pseudonyme a changé ailleurs pendant que celui-ci avait aussi du nouveau,
 *   la synchro s'arrête et on choisit la version à garder.
 */
export function useCloudSave(local: CloudSnapshot, apply: (snapshot: CloudSnapshot) => void, ready: boolean) {
  const [binding, setBinding] = useState<Binding | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const bindingRef = useRef<Binding | null>(null);
  const conflictRef = useRef(false);
  const localRef = useRef(local);
  const applyRef = useRef(apply);
  const syncing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pushRef = useRef<() => Promise<boolean>>(async () => true);
  localRef.current = local;
  applyRef.current = apply;

  const bind = useCallback((value: Binding | null) => {
    bindingRef.current = value;
    setBinding(value);
    writeBinding(value);
  }, []);
  const markConflict = useCallback((value: boolean) => {
    conflictRef.current = value;
    setConflict(value);
  }, []);
  const lose = useCallback(() => {
    clearTimeout(timer.current);
    bind(null);
    markConflict(false);
    setStatus("Cette sauvegarde en ligne n’existe plus. Le Pokédex reste sur cet appareil.");
  }, [bind, markConflict]);

  /** Envoie le Pokédex local. Renvoie true si tout est en ligne. */
  const push = useCallback(async (): Promise<boolean> => {
    const current = bindingRef.current;
    if (!current) return true;
    if (conflictRef.current || syncing.current) return false;
    const toSend = localRef.current;
    if (sameSnapshot(toSend, current.synced)) return true;
    syncing.current = true;
    setStatus("Sauvegarde en cours…");
    try {
      const remote = await request<Remote>(`/${current.nickname}`, { method: "PUT", body: JSON.stringify({ snapshot: toSend, etag: current.etag }) });
      if (bindingRef.current?.nickname !== current.nickname) return false;
      bind({ nickname: remote.nickname, etag: remote.etag, synced: remote.snapshot });
      setStatus("Pokédex sauvegardé ✓");
      return sameSnapshot(localRef.current, remote.snapshot);
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) lose();
      else if (error instanceof RequestError && error.status === 409) {
        markConflict(true);
        setStatus(`Le Pokédex de ${current.nickname} a changé sur un autre appareil. Choisis la version à garder.`);
      } else setStatus(messageOf(error, "La sauvegarde n’a pas abouti."));
      return false;
    } finally {
      syncing.current = false;
      // Un changement arrivé pendant l'envoi repartira juste après.
      const after = bindingRef.current;
      if (after && !conflictRef.current && !sameSnapshot(localRef.current, after.synced)) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { void pushRef.current(); }, 1500);
      }
    }
  }, [bind, lose, markConflict]);
  pushRef.current = push;

  const schedule = useCallback((delay = 800) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void pushRef.current(); }, delay);
  }, []);

  /** Vérifie la version en ligne (retour sur l'onglet, réseau revenu, démarrage). */
  const refresh = useCallback(async () => {
    const current = bindingRef.current;
    if (!current || syncing.current || conflictRef.current) return;
    try {
      const remote = await request<Remote>(`/${current.nickname}`);
      if (bindingRef.current?.nickname !== current.nickname) return;
      if (remote.etag !== current.etag) {
        if (sameSnapshot(localRef.current, current.synced)) {
          // Rien de nouveau ici : on prend la version en ligne, plus récente.
          applyRef.current(remote.snapshot);
          bind({ nickname: remote.nickname, etag: remote.etag, synced: remote.snapshot });
          setStatus("Pokédex mis à jour depuis ton autre appareil ✓");
        } else {
          markConflict(true);
          setStatus(`Le Pokédex de ${current.nickname} a changé sur un autre appareil. Choisis la version à garder.`);
        }
        return;
      }
      schedule(300);
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) lose();
      else setStatus(messageOf(error, ""));
    }
  }, [bind, lose, markConflict, schedule]);

  // Au démarrage : reprendre la sauvegarde liée, puis surveiller le retour sur l'onglet et le réseau.
  useEffect(() => {
    if (!ready) return;
    const saved = readBinding();
    if (saved) { bindingRef.current = saved; setBinding(saved); void refresh(); }
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready, refresh]);

  // Chaque changement local part en ligne (regroupé).
  useEffect(() => { if (ready && bindingRef.current) schedule(); }, [local, ready, schedule]);

  const suggest = useCallback(async () => {
    setBusy(true);
    try { return (await request<{ nicknames: string[] }>("/suggest")).nicknames; }
    catch (error) { setStatus(messageOf(error, "Réessaie dans un instant.")); return []; }
    finally { setBusy(false); }
  }, []);

  /** Crée la sauvegarde de l'enfant qui joue sur cet appareil, avec son Pokédex actuel. */
  const create = useCallback(async (nickname: string) => {
    setBusy(true);
    try {
      const remote = await request<Remote>("", { method: "POST", body: JSON.stringify({ nickname, snapshot: localRef.current }) });
      bind({ nickname: remote.nickname, etag: remote.etag, synced: remote.snapshot });
      markConflict(false);
      setStatus("C’est sauvegardé ! Note bien ton pseudonyme.");
      return true;
    } catch (error) { setStatus(messageOf(error, "Réessaie dans un instant.")); return false; }
    finally { setBusy(false); }
  }, [bind, markConflict]);

  /** Charge le Pokédex d'un pseudonyme à la place de celui de l'appareil. */
  const retrieve = useCallback(async (value: string) => {
    const nickname = value.trim().toLowerCase();
    if (!nickname) return false;
    setBusy(true);
    try {
      const remote = await request<Remote>(`/${encodeURIComponent(nickname)}`);
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(localRef.current)); } catch { /* copie de secours facultative */ }
      clearTimeout(timer.current);
      applyRef.current(remote.snapshot);
      bind({ nickname: remote.nickname, etag: remote.etag, synced: remote.snapshot });
      markConflict(false);
      setStatus(`Bonjour ${remote.nickname} ! Ton Pokédex est chargé ✓`);
      return true;
    } catch (error) { setStatus(messageOf(error, "Vérifie ton pseudonyme.")); return false; }
    finally { setBusy(false); }
  }, [bind, markConflict]);

  /** Sauvegarde puis vide l'appareil pour l'enfant suivant. */
  const switchPlayer = useCallback(async () => {
    const current = bindingRef.current;
    if (!current) return true;
    setBusy(true);
    try {
      clearTimeout(timer.current);
      for (let i = 0; i < 20 && syncing.current; i++) await new Promise(r => setTimeout(r, 150));
      const saved = await pushRef.current();
      if (!saved) {
        setStatus(conflictRef.current
          ? "Choisis d’abord la version à garder, puis change de joueur."
          : "Le Pokédex n’est pas encore sauvegardé (connexion ?). Réessaie avant de changer de joueur.");
        return false;
      }
      bind(null);
      markConflict(false);
      applyRef.current(emptySnapshot());
      setStatus(`À bientôt ${current.nickname} ! Au suivant : choisis ou retrouve ton pseudonyme.`);
      return true;
    } finally { setBusy(false); }
  }, [bind, markConflict]);

  /** Conflit : reprendre la version en ligne. */
  const keepOnline = useCallback(async () => {
    const current = bindingRef.current;
    if (!current) return;
    markConflict(false);
    await retrieve(current.nickname);
  }, [markConflict, retrieve]);

  /** Conflit : garder la version de cet appareil et l'envoyer en ligne. */
  const keepThisDevice = useCallback(async () => {
    const current = bindingRef.current;
    if (!current) return;
    setBusy(true);
    try {
      const online = await request<Remote>(`/${current.nickname}`);
      const remote = await request<Remote>(`/${current.nickname}`, { method: "PUT", body: JSON.stringify({ snapshot: localRef.current, etag: online.etag }) });
      bind({ nickname: remote.nickname, etag: remote.etag, synced: remote.snapshot });
      markConflict(false);
      setStatus("Pokédex de cet appareil sauvegardé ✓");
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) lose();
      else setStatus(messageOf(error, "Réessaie dans un instant."));
    } finally { setBusy(false); }
  }, [bind, lose, markConflict]);

  const remove = useCallback(async () => {
    const current = bindingRef.current;
    if (!current) return;
    setBusy(true);
    try {
      await request(`/${current.nickname}`, { method: "DELETE" });
      clearTimeout(timer.current);
      bind(null);
      markConflict(false);
      setStatus("Sauvegarde en ligne supprimée. Le Pokédex reste sur cet appareil.");
    } catch (error) { setStatus(messageOf(error, "La suppression n’a pas abouti.")); }
    finally { setBusy(false); }
  }, [bind, markConflict]);

  return { nickname: binding?.nickname ?? null, status, busy, conflict, suggest, create, retrieve, switchPlayer, keepOnline, keepThisDevice, remove };
}
export type CloudSave = ReturnType<typeof useCloudSave>;
