"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, Smartphone } from "lucide-react";
import { Card } from "@/components/dashboard/Card";
import { PageHeader } from "@/components/shell/PageHeader";
import type { AfricasTalkingStatus } from "@/lib/airtime";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";

type Note = { ok: boolean; message: string } | null;

/**
 * Settings → Africa's Talking: only whether airtime can be sent. The account is set up on the server and nothing about
 * it (username, API key, address) is shown here or sent to the browser.
 */
export function AfricasTalkingView() {
  const [status, setStatus] = useState<AfricasTalkingStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void erpApi.africasTalking.get().then((r) => (r.ok ? setStatus(r.data) : setLoadError(r.message)));
  }, []);

  async function test() {
    setBusy(true);
    setNote(null);
    const r = await erpApi.africasTalking.test();
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, message: r.message });
    setNote(r.data.ok ? { ok: true, message: `Connected. Account balance: ${r.data.balance}.` } : { ok: false, message: r.data.message ?? "The account did not answer." });
  }

  return (
    <>
      <PageHeader title="Africa's Talking" subtitle="The account Communication → Airtime uses to send airtime to tracker SIM cards." />
      {loadError && <p role="alert" className="mt-5 text-[#C62828]">{loadError}</p>}
      {!status && !loadError && (
        <p role="status" className="mt-5 flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…</p>
      )}
      {status && (
        <div className="flex max-w-3xl flex-col gap-5">
          {note && (
            <p role="status" className={cn("flex items-start gap-2 rounded-xl px-3.5 py-3 text-[14px]", note.ok ? "bg-[#E6F4EA] text-[#1B5E20]" : "bg-[#FDECEA] text-[#B71C1C]")}>
              {note.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />}
              {note.message}
            </p>
          )}
          <Card className="flex flex-col gap-4 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-[#FFF1EA] text-brand" aria-hidden="true"><Smartphone size={21} /></span>
                <div>
                  <h2 className="text-lg font-semibold leading-tight">Africa&apos;s Talking</h2>
                  <p className="text-[13px] text-muted">Airtime</p>
                </div>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-[13px] font-semibold", status.configured ? "bg-[#E6F4EA] text-[#1B5E20]" : "bg-canvas text-muted")}>
                {status.configured ? "Set up" : "Not set up"}
              </span>
            </div>

            {status.configured ? (
              <div className="flex flex-col gap-3">
                <p className="text-[14.5px]">Airtime can be sent from Communication → Airtime.</p>
                <div>
                  <button type="button" onClick={() => void test()} disabled={busy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas disabled:opacity-60">
                    {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <PlugZap size={17} aria-hidden="true" />}
                    Test and show balance
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[14.5px]">Airtime cannot be sent yet. Ask the system administrator to set up Africa&apos;s Talking on the server.</p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
