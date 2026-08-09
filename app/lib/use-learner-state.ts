"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyLearnerState, mergeLearnerState, type LearnerState } from "./learning";

type SyncStatus = "loading" | "saved" | "saving" | "offline";

const CACHE_KEY = "anatomy-atelier-state-cache-v1";

function readCache() {
  try {
    return mergeLearnerState(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"));
  } catch {
    return emptyLearnerState;
  }
}

export function useLearnerState() {
  const [state, setState] = useState<LearnerState>(emptyLearnerState);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBeforeLoad = useRef<LearnerState | null>(null);
  const pendingWrite = useRef<LearnerState | null>(null);

  const saveRemote = useCallback((next: LearnerState) => {
    pendingWrite.current = next;
    setSyncStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Save failed");
          if (pendingWrite.current === next) pendingWrite.current = null;
          setSyncStatus("saved");
        })
        .catch(() => setSyncStatus("offline"));
    }, 450);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/state", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("State service unavailable");
        const remote = mergeLearnerState(await response.json());
        const next = pendingBeforeLoad.current ?? remote;
        setState(next);
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        loaded.current = true;
        if (pendingBeforeLoad.current) saveRemote(next);
        else setSyncStatus("saved");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        const next = pendingBeforeLoad.current ?? readCache();
        setState(next);
        loaded.current = true;
        setSyncStatus("offline");
      })
      .finally(() => {
        if (!controller.signal.aborted) loaded.current = true;
      });
    return () => controller.abort();
  }, [saveRemote]);

  const persist = useCallback((next: LearnerState) => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    if (!loaded.current) {
      pendingBeforeLoad.current = next;
      return;
    }
    saveRemote(next);
  }, [saveRemote]);

  const updateState = useCallback((update: (current: LearnerState) => LearnerState) => {
    setState((current) => {
      const next = update(current);
      persist(next);
      return next;
    });
  }, [persist]);

  useEffect(() => {
    const flush = () => {
      if (!pendingWrite.current) return;
      void fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingWrite.current),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flush();
    };
  }, []);

  return { state, updateState, syncStatus };
}

export function trackLearningEvent(event: string, organId?: string, metadata?: Record<string, string | number | boolean>) {
  const payload = JSON.stringify({ event, organId, metadata });
  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const queued = navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
    if (queued) return;
  }
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}
