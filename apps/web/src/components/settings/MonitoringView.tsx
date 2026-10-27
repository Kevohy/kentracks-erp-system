"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, CheckCircle2, Cpu, Database, Gauge, Loader2, RefreshCw, Satellite, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { Card, Panel } from "@/components/dashboard/Card";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import { bytes, duration, MONITOR_REFRESH_SECONDS, type Monitoring } from "@/lib/monitoring";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Nairobi" });
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `at ${time(iso).slice(0, 5)}`;
};

const OVERALL = {
  ok: { label: "All systems working", cls: "border-[#BFE3C8] bg-[#EEF8F1] text-[#14633a]", Icon: CheckCircle2 },
  warning: { label: "Working, with warnings", cls: "border-[#F6D9B8] bg-[#FFF8EF] text-[#7a3600]", Icon: TriangleAlert },
  down: { label: "Database unreachable", cls: "border-[#F3C3BE] bg-[#FDF0EE] text-[#9e241a]", Icon: XCircle },
} as const;

function Stat({ icon: Icon, label, value, note, tone = "ok" }: { icon: typeof Cpu; label: string; value: ReactNode; note?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <Card className="flex min-w-0 items-start gap-3 px-4 py-4">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl",
        tone === "ok" ? "bg-[#EEF8F1] text-[#2E7D32]" : tone === "warn" ? "bg-[#FFF4E5] text-[#9a3300]" : "bg-[#FDECEA] text-[#C62828]")}>
        <Icon size={19} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] text-muted">{label}</p>
        <p className="text-[18px] font-semibold leading-tight">{value}</p>
        {note && <p className="mt-0.5 text-[12.5px] text-muted">{note}</p>}
      </div>
    </Card>
  );
}

function Meter({ label, used, total, text }: { label: string; used: number; total: number; text: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[13px]"><span className="text-muted">{label}</span><span className="font-semibold tabular-nums">{text}</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#EEF2F5]" role="meter" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("h-full rounded-full", pct > 85 ? "bg-[#C62828]" : pct > 65 ? "bg-[#E0A100]" : "bg-navy")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Requests per minute for the last hour: allowed in navy, held back by the rate limit in orange, server errors in red. */
function RequestsChart({ m }: { m: Monitoring }) {
  const pts = m.requests.perMinute;
  const max = Math.max(10, ...pts.map((p) => p.requests));
  const W = 600;
  const H = 140;
  const step = W / pts.length;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
        aria-label={`API requests per minute, last hour: ${m.requests.lastHour.requests} requests, ${m.requests.lastHour.limited} held back, ${m.requests.lastHour.errors} errors.`}>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#CBD5DD" />
        {pts.map((p, i) => {
          const h = (p.requests / max) * (H - 8);
          const hl = (p.limited / max) * (H - 8);
          const he = (p.errors / max) * (H - 8);
          const x = i * step + step * 0.15;
          const w = step * 0.7;
          return (
            <g key={p.minute}>
              <title>{`${time(p.minute).slice(0, 5)}: ${p.requests} requests${p.limited ? `, ${p.limited} held back` : ""}${p.errors ? `, ${p.errors} errors` : ""}`}</title>
              <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
              {h > 0 && <rect x={x} y={H - h} width={w} height={h} rx="1.5" fill="#055587" fillOpacity="0.8" />}
              {hl > 0 && <rect x={x} y={H - h} width={w} height={Math.max(2, hl)} rx="1.5" fill="#FE5102" />}
              {he > 0 && <rect x={x} y={H - Math.max(2, he)} width={w} height={Math.max(2, he)} rx="1.5" fill="#C62828" />}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11.5px] text-muted" aria-hidden="true">
        <span>{time(pts[0].minute).slice(0, 5)}</span><span>{time(pts[Math.floor(pts.length / 2)].minute).slice(0, 5)}</span><span>now</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="block size-2.5 rounded-sm bg-navy/80" />Requests</span>
        <span className="inline-flex items-center gap-1.5"><i className="block size-2.5 rounded-sm bg-brand" />Held back (rate limit)</span>
        <span className="inline-flex items-center gap-1.5"><i className="block size-2.5 rounded-sm bg-[#C62828]" />Server errors</span>
      </div>
    </div>
  );
}

/** Settings → Server monitoring: is the server healthy, how busy is it, and is anyone being rate limited. */
export function MonitoringView() {
  const [m, setM] = useState<Monitoring | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const r = await erpApi.monitoring.get();
    inFlight.current = false;
    setBusy(false);
    if (r.ok) {
      setM(r.data);
      setError(null);
    } else setError(r.message);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), MONITOR_REFRESH_SECONDS * 1000);
    const onShow = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [load]);

  const o = m ? OVERALL[m.overall] : null;
  return (
    <>
      <PageHeader title="Server Monitoring" subtitle="Health, load, requests and background jobs of this server"
        aside={
          <div className="flex items-center gap-2">
            {m && <span className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-white px-3 text-[13px] font-medium text-muted" role="status">
              <i className="block size-[7px] rounded-full bg-[#2E7D32]" aria-hidden="true" />Live · {time(m.asOf)}
            </span>}
            <button type="button" onClick={() => void load()} disabled={busy} aria-label="Refresh" title="Refresh"
              className="grid size-8 place-items-center rounded-full border border-line bg-white text-navy hover:bg-canvas disabled:opacity-60">
              <RefreshCw size={14} className={busy ? "animate-spin" : undefined} aria-hidden="true" />
            </button>
          </div>
        } />
      {error && <p role="alert" className="rounded-xl bg-[#FDECEA] px-3.5 py-3 text-[14px] text-[#B71C1C]">{m ? `Could not refresh: ${error}` : error}</p>}
      {!m && !error && <p role="status" className="flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…</p>}
      {m && o && (
        <>
          <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border px-4 py-3 text-[14.5px] font-semibold", o.cls)} role="status">
            <o.Icon size={18} aria-hidden="true" />{o.label}
            <span className="w-full text-[13px] font-normal sm:ml-auto sm:w-auto">Up {duration(m.app.uptimeSeconds)} · {m.app.environment} · Node {m.app.node}</span>
          </div>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Status">
            <Stat icon={Database} label="Database" tone={!m.database.ok ? "bad" : (m.database.latencyMs ?? 0) > 200 ? "warn" : "ok"}
              value={m.database.ok ? `${m.database.latencyMs} ms` : "Unreachable"}
              note={m.database.ok ? `${bytes(m.database.sizeBytes)} · ${m.database.connections} connections${m.database.migrations != null ? ` · ${m.database.migrations} update${m.database.migrations === 1 ? "" : "s"} applied` : ""}` : "Check the database server"} />
            <Stat icon={Activity} label="Requests, last 5 min" tone={m.requests.lastFiveMinutes.errors ? "warn" : "ok"}
              value={m.requests.lastFiveMinutes.requests.toLocaleString("en-US")}
              note={`${m.requests.lastFiveMinutes.errors} server errors · ${m.requests.lastFiveMinutes.limited} held back`} />
            <Stat icon={Gauge} label="Event loop delay" tone={m.app.eventLoopDelayMs > 100 ? "bad" : m.app.eventLoopDelayMs > 40 ? "warn" : "ok"}
              value={`${m.app.eventLoopDelayMs} ms`} note={m.app.eventLoopDelayMs > 40 ? "The server is busy" : "Responsive"} />
            <Stat icon={Satellite} label="GPS status" tone={m.gps.accounts === 0 ? "warn" : "ok"}
              value={m.gps.accounts ? `checked ${ago(m.gps.statusCheckedAt)}` : "No API account"}
              note={`${m.gps.devices.toLocaleString("en-US")} devices · ${m.gps.accounts} API account${m.gps.accounts === 1 ? "" : "s"}`} />
          </section>

          <section className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel title="API requests" subtitle={`Per minute, last hour · ${m.requests.lastHour.requests.toLocaleString("en-US")} requests, ${m.requests.lastHour.limited} held back, ${m.requests.lastHour.errors} errors`}>
              <RequestsChart m={m} />
            </Panel>
            <Panel title="Resources" subtitle={`${m.app.system.cpus} CPU cores · load ${m.app.system.load1} (1 min), ${m.app.system.load5} (5 min)`}>
              <div className="flex flex-col gap-4">
                <Meter label="Server memory" used={m.app.system.totalMemBytes - m.app.system.freeMemBytes} total={m.app.system.totalMemBytes}
                  text={`${bytes(m.app.system.totalMemBytes - m.app.system.freeMemBytes)} of ${bytes(m.app.system.totalMemBytes)}`} />
                <Meter label="App memory (of its limit)" used={m.app.memory.heapUsedBytes} total={m.app.memory.heapTotalBytes}
                  text={`${bytes(m.app.memory.heapUsedBytes)} of ${bytes(m.app.memory.heapTotalBytes)}`} />
                <Meter label="CPU load (1 min)" used={m.app.system.load1} total={m.app.system.cpus} text={`${m.app.system.load1} / ${m.app.system.cpus}`} />
                <p className="text-[12.5px] text-muted">The app process uses {bytes(m.app.memory.rssBytes)} in total.</p>
              </div>
            </Panel>
          </section>

          <section className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-3">
            <Panel title="Data protection" subtitle="Row-level security in the database">
              <div className={cn("flex items-start gap-3 rounded-xl px-3.5 py-3", m.rls.active ? "bg-[#EEF8F1]" : "bg-[#FDF0EE]")} role="status">
                {m.rls.active ? <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#2E7D32]" aria-hidden="true" /> : <TriangleAlert size={18} className="mt-0.5 shrink-0 text-[#C62828]" aria-hidden="true" />}
                <p className={cn("text-[13.5px] leading-relaxed", m.rls.active ? "text-[#14633a]" : "text-[#9e241a]")}>
                  {m.rls.active
                    ? <>Active on {m.rls.tables} tables. The database itself only shows each company its own rows, even if a query forgets to ask for them.</>
                    : <>Not active: {m.rls.tables === 0 ? "the database updates have not been applied" : `the database user (${m.rls.role ?? "unknown"}) can skip the rules`}. Run the database updates and restart the app.</>}
                </p>
              </div>
            </Panel>
            <Panel title="Rate limiting" subtitle="Token bucket per signed-in user">
              <div className="flex items-start gap-3 rounded-xl bg-canvas px-3.5 py-3">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />
                <p className="text-[13.5px] leading-relaxed text-muted">
                  Each user has a bucket of <span className="font-semibold text-ink">{m.rateLimit.capacity} requests</span> that refills at{" "}
                  <span className="font-semibold text-ink">{m.rateLimit.perSecond} per second</span>. Normal use never empties it; a burst gets {m.rateLimit.capacity} and then
                  {" "}{m.rateLimit.perSecond} a second, so it can never double the limit.
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-line px-2 py-2.5"><dt className="text-[12px] text-muted">Active users</dt><dd className="text-[18px] font-semibold tabular-nums">{m.rateLimit.clients}</dd></div>
                <div className={cn("rounded-xl border px-2 py-2.5", m.rateLimit.limitedNow ? "border-[#F6D9B8] bg-[#FFF8EF]" : "border-line")}><dt className="text-[12px] text-muted">Held back now</dt><dd className="text-[18px] font-semibold tabular-nums">{m.rateLimit.limitedNow}</dd></div>
                <div className="rounded-xl border border-line px-2 py-2.5"><dt className="text-[12px] text-muted">Held back, 1 h</dt><dd className="text-[18px] font-semibold tabular-nums">{m.requests.lastHour.limited}</dd></div>
              </dl>
            </Panel>
            <Panel title="Background jobs" subtitle="On this server since it started">
              {m.jobs.length === 0 ? <p className="text-[14px] text-muted">No background job has run yet on this server.</p> : (
                <ul className="flex flex-col">
                  {m.jobs.map((j) => (
                    <li key={j.name} className="flex items-start gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                      {j.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#2E7D32]" aria-label="Last run worked" /> : <XCircle size={17} className="mt-0.5 shrink-0 text-[#C62828]" aria-label="Last run failed" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium">{j.name}</p>
                        <p className="text-[12.5px] text-muted">{j.summary}</p>
                      </div>
                      <div className="text-right text-[12.5px] text-muted">
                        <p className="whitespace-nowrap">{ago(j.lastRunAt)} · {j.durationMs < 1000 ? `${j.durationMs} ms` : `${(j.durationMs / 1000).toFixed(1)} s`}</p>
                        <p className="whitespace-nowrap">{j.runs} runs{j.failures ? ` · ${j.failures} failed` : ""}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </section>
          <p className="text-[12.5px] text-muted">Figures are for this server process and start again when it restarts. For alerts when the site is down, point an uptime monitor at /api/health.</p>
        </>
      )}
    </>
  );
}
