"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiResult } from "@/lib/crm-api";

export type ListState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; items: T[] };

/** Loads a CRM list from the API on mount and offers reload plus local updates after a successful save. */
export function useCrmList<T extends { id: string }>(fetcher: () => Promise<ApiResult<T[]>>) {
  const [state, setState] = useState<ListState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetcher().then((r) => {
      if (cancelled) return;
      setState(r.ok ? { status: "ready", items: r.data } : { status: "error", message: r.message });
    });
    return () => {
      cancelled = true;
    };
    // The fetchers are module-level functions, so they never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  const prepend = useCallback((item: T) => setState((s) => (s.status === "ready" ? { status: "ready", items: [item, ...s.items] } : s)), []);
  const replace = useCallback((item: T) => setState((s) => (s.status === "ready" ? { status: "ready", items: s.items.map((i) => (i.id === item.id ? item : i)) } : s)), []);

  return { state, retry, prepend, replace };
}

/** The single table row shown while loading, on failure, or when there is nothing to list. */
export function ListStatusRow({ state, colSpan, empty, retry }: { state: ListState<unknown>; colSpan: number; empty: string; retry: () => void }) {
  if (state.status === "ready" && state.items.length > 0) return null;
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-12 text-center text-muted">
        {state.status === "loading" && <span role="status">Loading…</span>}
        {state.status === "error" && (
          <span role="alert" className="flex flex-col items-center gap-3">
            <span className="text-[#C62828]">{state.message}</span>
            <button type="button" onClick={retry} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold text-ink hover:bg-canvas">
              Try again
            </button>
          </span>
        )}
        {state.status === "ready" && state.items.length === 0 && empty}
      </td>
    </tr>
  );
}
