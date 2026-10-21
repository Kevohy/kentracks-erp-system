"use client";

import { useCallback, useEffect, useState } from "react";
import { crmApi } from "@/lib/crm-api";
import type { Customer } from "@/lib/customers";
import type { Supplier } from "@/lib/suppliers";
import type { Technician } from "@/lib/technicians";

type Wanted = { customers?: boolean; suppliers?: boolean; technicians?: boolean };
type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; customers: Customer[]; suppliers: Supplier[]; technicians: Technician[] };

/**
 * The CRM records a form chooses from (customers, suppliers, technicians), read fresh from the
 * server each time the form opens, so a record added a moment ago in the CRM is already there.
 */
export function useCrmLookups(wanted: Wanted) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { customers, suppliers, technicians } = wanted;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      customers ? crmApi.customers.list() : Promise.resolve({ ok: true as const, data: [] as Customer[] }),
      suppliers ? crmApi.suppliers.list() : Promise.resolve({ ok: true as const, data: [] as Supplier[] }),
      technicians ? crmApi.technicians.list() : Promise.resolve({ ok: true as const, data: [] as Technician[] }),
    ]).then(([c, s, t]) => {
      if (cancelled) return;
      if (!c.ok) setState({ status: "error", message: c.message });
      else if (!s.ok) setState({ status: "error", message: s.message });
      else if (!t.ok) setState({ status: "error", message: t.message });
      else setState({ status: "ready", customers: c.data, suppliers: s.data, technicians: t.data });
    });
    return () => {
      cancelled = true;
    };
  }, [customers, suppliers, technicians, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}
