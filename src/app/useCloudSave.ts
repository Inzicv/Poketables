"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergePokedex, sameSnapshot, sanitizeSnapshot, type CloudSnapshot, type Remote } from "@/lib/cloud";

type Binding = { nickname: string; etag: string; synced: CloudSnapshot };
const BINDING_KEY = "poketable:cloud:v1";

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

/**
 * Sauvegarde en ligne par pseudonyme.
 * Le Pokédex local est envoyé après chaque changement. Si un autre appareil a modifié la sauvegarde,
 * les deux Pokédex sont fusionnés (aucun Pokémon perdu) avant d'être renvoyés.
 */
export function useCloudSave(local: CloudSnapshot, apply: (snapshot: CloudSnapshot) => void, ready: boolean) {
  const [binding, setBinding] = useState<Binding | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const bindingRef = useRef<Binding | null>(null);
  const localRef = useRef(local);
  const applyRef = useRef(apply);
  const syncing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pushRef = useRef<() => Promise<void>>(async () => {});
  localRef.current = local;
  applyRef.current = apply;

  const bind = useCallback((value: Binding | null) => {
    bindingRef.current = value;
    setBinding(value);
    writeBinding(value);
  }, []);

  const push = useCallback(async () => {
    const current = bindingRef.current;
    if (!current || syncing.current) return;
    let toSend = localRef.current;
    if (sameSnapshot(toSend, current.synced)) return;
    syncing.current = true;
    setStatus("Sauvegarde en cours…");
    try {
      let etag = current.etag;
      for (let attempt = 0; ; attempt++) {
        try {
          const remote = await request<Remote>(`/${current.nickname}`, { method: "PUT", body: JSON.stringify({ snapshot: toSend, etag }) });
          if (bindingRef.current?.nickname !== current.nickname) return;
          bind({ nickname: remote.nickname, etag: remote.etag, synced: remote.snapshot });
          setStatus("Pokédex sauvegardé ✓");
          return;
        } catch (error) {
          if (!(error instanceof RequestError) || error.status !== 409 || attempt >= 2) throw error;
          // Un autre appareil a sauvegardé entre-temps : on fusionne et on recommence.
          const remote = await request<Remote>(`/${current.nickname}`);
          toSend = { pokedex: mergePokedex(toSend.pokedex, remote.snapshot.pokedex), settings: toSend.settings };
          applyRef.current(toSend);
          etag = remote.etag;
        }
      }
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) {
        bind(null);
        setStatus("Cette sauvegarde en ligne n’existe plus. Ton Pokédex reste sur cet appareil.");
      } else setStatus(error instanceof Error ? error.message : "La sauvegarde n’a pas abouti.");
    } finally {
      syncing.current = false;
      // Un changement arrivé pendant l'envoi repartira juste après.
      const after = bindingRef.current;
      if (after && !sameSnapshot(localRef.current, after.synced)) setTimeout(() => { void pushRef.current(); }, 1500);
    }
  }, [bind]);
  pushRef.current = push;

  const schedule = useCallback((delay = 800) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void push(); }, delay);
  }, [push]);

  const refresh = useCallback(async () => {
    const current = bindingRef.current;
    if (!current || syncing.current) return;
    try {
      const remote = await request<Remote>(`/${current.nickname}`);
      if (bindingRef.current?.nickname !== current.nickname) return;
      if (remote.etag !== current.etag) {
        const merged = { pokedex: mergePokedex(localRef.current.pokedex, remote.snapshot.pokedex), settings: localRef.current.settings };
        applyRef.current(merged);
        bind({ nickname: remote.nickname, etag: remote.etag, synced: remote.snapshot });
        setStatus("Pokédex mis à jour avec ton autre appareil ✓");
      }
      schedule(300);
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) {
        bind(null);
        setStatus("Cette sauvegarde en ligne n’existe plus. Ton Pokédex reste sur cet appareil.");
      } else setStatus(error instanceof Error ? error.message : "");
    }
  }, [bind, schedule]);

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
    catch (error) { setStatus(error instanceof Error ? error.message : "Réessaie dans un instant."); return []; }
    finally { setBusy(false); }
  }, []);

  const create = useCallback(async (nickname: string) => {
    setBusy(true);
    try {
      const snapshot = localRef.current;
      const remote = await request<Remote>("", { method: "POST", body: JSON.stringify({ nickname, snapshot }) });
      bind({ nickname: remote.nickname, etag: remote.etag, synced: remote.snapshot });
      setStatus("C’est sauvegardé ! Note bien ton pseudonyme.");
      return true;
    } catch (error) { setStatus(error instanceof Error ? error.message : "Réessaie dans un instant."); return false; }
    finally { setBusy(false); }
  }, [bind]);

  const retrieve = useCallback(async (value: string) => {
    const nickname = value.trim().toLowerCase();
    if (!nickname) return false;
    setBusy(true);
    try {
      const remote = await request<Remote>(`/${encodeURIComponent(nickname)}`);
      // Les Pokémon de cet appareil s'ajoutent à la sauvegarde retrouvée ; on reprend ses réglages.
      applyRef.current({ pokedex: mergePokedex(localRef.current.pokedex, remote.snapshot.pokedex), settings: remote.snapshot.settings });
      bind({ nickname: remote.nickname, etag: remote.etag, synced: remote.snapshot });
      setStatus("Pokédex retrouvé ✓");
      return true;
    } catch (error) { setStatus(error instanceof Error ? error.message : "Vérifie ton pseudonyme."); return false; }
    finally { setBusy(false); }
  }, [bind]);

  const leave = useCallback(() => {
    clearTimeout(timer.current);
    bind(null);
    setStatus("La sauvegarde reste en ligne. Ton pseudonyme permet de la retrouver.");
  }, [bind]);

  const remove = useCallback(async () => {
    const current = bindingRef.current;
    if (!current) return;
    setBusy(true);
    try {
      await request(`/${current.nickname}`, { method: "DELETE" });
      clearTimeout(timer.current);
      bind(null);
      setStatus("Sauvegarde en ligne supprimée. Ton Pokédex reste sur cet appareil.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "La suppression n’a pas abouti."); }
    finally { setBusy(false); }
  }, [bind]);

  return { nickname: binding?.nickname ?? null, status, busy, suggest, create, retrieve, leave, remove };
}
export type CloudSave = ReturnType<typeof useCloudSave>;
