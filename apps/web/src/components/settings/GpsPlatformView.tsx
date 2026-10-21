"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Pencil, PlugZap, Plus, Satellite, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/dashboard/Card";
import { cn } from "@/lib/cn";
import { erpApi } from "@/lib/erp-api";
import type { GpsAccountStatus, GpsPlatformInfo } from "@/lib/gps-platforms";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const input = "min-h-11 w-full rounded-xl border bg-white px-3.5 text-[15px]";
type Note = { ok: boolean; message: string } | null;

function Status({ a }: { a: GpsAccountStatus }) {
  if (a.connected) return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[12.5px] font-semibold text-[#1B5E20]"><span className="size-1.5 rounded-full bg-[#2E7D32]" />Connected</span>;
  if (a.lastError) return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#FDECEA] px-2.5 py-0.5 text-[12.5px] font-semibold text-[#B71C1C]"><span className="size-1.5 rounded-full bg-[#C62828]" />Not connected</span>;
  return <span className="whitespace-nowrap rounded-full bg-[#FFF4E5] px-2.5 py-0.5 text-[12.5px] font-semibold text-[#9a3300]">Not tested</span>;
}

/** Add a new account (no `editing`) or change one. An empty password keeps the saved one when editing. */
function AccountForm({ platform, editing, onDone, onCancel }: { platform: GpsPlatformInfo; editing?: GpsAccountStatus; onDone: (a: GpsAccountStatus, message: string) => void; onCancel: () => void }) {
  const [account, setAccount] = useState(editing?.account ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accountRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const idp = editing ? `gps-edit-${editing.id}` : `gps-new-${platform.id}`;

  useEffect(() => {
    accountRef.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    if (!account.trim()) found.account = "Enter the account";
    if (!editing && !password) found.password = "Enter the password";
    setErrors(found);
    setFormError(null);
    if (found.account) return accountRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    setBusy(true);
    const r = editing ? await erpApi.gpsPlatforms.update(editing.id, account.trim(), password) : await erpApi.gpsPlatforms.add(platform.id, account.trim(), password);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors);
      if (r.fieldErrors.form || !Object.keys(r.fieldErrors).length) setFormError(r.fieldErrors.form ?? r.message);
      if (r.fieldErrors.account) accountRef.current?.focus();
      else if (r.fieldErrors.password) passwordRef.current?.focus();
      return;
    }
    onDone(r.data, editing ? `${r.data.account} saved and connected.` : `${r.data.account} added and connected.`);
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-label={editing ? `Edit ${editing.account}` : `Add a ${platform.name} account`}
      className="flex flex-col gap-3 rounded-xl border border-line bg-canvas/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idp}-account`} className="text-[14px] font-medium">Account</label>
          <input ref={accountRef} id={`${idp}-account`} autoComplete="username" spellCheck={false} value={account}
            onChange={(e) => { setAccount(e.target.value); setErrors((x) => ({ ...x, account: "" })); }}
            aria-invalid={errors.account ? true : undefined} aria-describedby={errors.account ? `${idp}-account-err` : undefined}
            className={cn(input, errors.account ? "border-[#C62828]" : "border-line")} />
          {errors.account && <p id={`${idp}-account-err`} className="text-[13.5px] text-[#C62828]">{errors.account}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idp}-password`} className="text-[14px] font-medium">Password</label>
          <div className="relative">
            <input ref={passwordRef} id={`${idp}-password`} type={show ? "text" : "password"} autoComplete={editing ? "current-password" : "new-password"} value={password}
              placeholder={editing ? "Leave empty to keep it" : ""}
              onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: "" })); }}
              aria-invalid={errors.password ? true : undefined} aria-describedby={errors.password ? `${idp}-password-err` : undefined}
              className={cn(input, "pr-12", errors.password ? "border-[#C62828]" : "border-line")} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-white">
              {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {errors.password && <p id={`${idp}-password-err`} className="text-[13.5px] text-[#C62828]">{errors.password}</p>}
        </div>
      </div>
      {formError && <p role="alert" className="flex items-start gap-2 rounded-xl bg-[#FDECEA] px-3.5 py-2.5 text-[14px] text-[#B71C1C]"><AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{formError}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:brightness-95 disabled:opacity-60">
          {busy && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
          {busy ? "Connecting…" : editing ? "Save and connect" : "Add and connect"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas">Cancel</button>
      </div>
    </form>
  );
}

function AccountRow({ a, platform, onChange, onRemoved, setNote }: {
  a: GpsAccountStatus; platform: GpsPlatformInfo; onChange: (a: GpsAccountStatus) => void; onRemoved: (id: string) => void; setNote: (n: Note) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"test" | "remove" | null>(null);

  const test = async () => {
    setBusy("test");
    const r = await erpApi.gpsPlatforms.test(a.id);
    setBusy(null);
    if (!r.ok) return setNote({ ok: false, message: r.message });
    onChange(r.data.account);
    setNote(r.data.ok ? { ok: true, message: `${a.account} is connected.` } : { ok: false, message: `${a.account}: ${r.data.message ?? "could not connect."}` });
  };
  const remove = async () => {
    setBusy("remove");
    const r = await erpApi.gpsPlatforms.remove(a.id);
    setBusy(null);
    if (!r.ok) return setNote({ ok: false, message: r.message });
    onRemoved(a.id);
    setNote({ ok: true, message: `${a.account} was removed.` });
  };

  if (editing) {
    return (
      <li className="py-3">
        <AccountForm platform={platform} editing={a} onCancel={() => setEditing(false)}
          onDone={(x, message) => { setEditing(false); onChange(x); setNote({ ok: true, message }); }} />
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15.5px] font-semibold">{a.account}</span>
            <Status a={a} />
          </p>
          <p className="text-[12.5px] text-muted">
            {a.connected ? `Token renews ${when(a.refreshAt)} · expires ${when(a.expiresAt)}` : a.lastError ? a.lastError.message : "Use Test to connect."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => void test()} disabled={!!busy} aria-label={`Test ${a.account}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[14px] font-semibold hover:bg-canvas disabled:opacity-60">
            {busy === "test" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <PlugZap size={15} aria-hidden="true" />}Test
          </button>
          <button type="button" onClick={() => setEditing(true)} disabled={!!busy} aria-label={`Edit ${a.account}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[14px] font-semibold hover:bg-canvas disabled:opacity-60">
            <Pencil size={15} aria-hidden="true" />Edit
          </button>
          <button type="button" onClick={() => setConfirm(true)} disabled={!!busy} aria-label={`Remove ${a.account}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold text-[#B71C1C] hover:bg-[#FDECEA] disabled:opacity-60">
            <Trash2 size={15} aria-hidden="true" />Remove
          </button>
        </div>
      </div>
      {confirm && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F2C4C0] bg-[#FFF8F7] px-4 py-3 text-[14px]">
          <span className="flex-1">Remove {a.account} from the ERP?</span>
          <button type="button" onClick={() => void remove()} disabled={!!busy} className="min-h-10 rounded-lg bg-[#C62828] px-4 font-semibold text-white disabled:opacity-60">
            {busy === "remove" ? "Removing…" : "Remove"}
          </button>
          <button type="button" onClick={() => setConfirm(false)} className="min-h-10 rounded-lg border border-line bg-white px-4 font-semibold">Cancel</button>
        </div>
      )}
    </li>
  );
}

/** Settings → GPS Platforms: each platform (Kentracks, iTrack) with the company's API accounts on it. */
export function GpsPlatformView() {
  const [platforms, setPlatforms] = useState<GpsPlatformInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);

  const load = useCallback(async () => {
    const r = await erpApi.gpsPlatforms.list();
    if (!r.ok) return setLoadError(r.message);
    setPlatforms(r.data);
    setLoadError(null);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const patch = (platformId: string, fn: (list: GpsAccountStatus[]) => GpsAccountStatus[]) =>
    setPlatforms((ps) => ps && ps.map((p) => (p.id === platformId ? { ...p, accounts: fn(p.accounts) } : p)));

  return (
    <>
      <PageHeader title="GPS Platforms" subtitle="The tracking platforms the ERP connects to, and your API accounts on each." />
      {loadError && <p role="alert" className="mt-5 text-[#C62828]">{loadError}</p>}
      {!platforms && !loadError && <p role="status" className="mt-5 flex items-center gap-2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading…</p>}

      <div className="mt-5 flex max-w-3xl flex-col gap-5">
        {note && (
          <p role="status" className={cn("flex items-start gap-2 rounded-xl px-3.5 py-3 text-[14px]", note.ok ? "bg-[#E6F4EA] text-[#1B5E20]" : "bg-[#FDECEA] text-[#B71C1C]")}>
            {note.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />}
            {note.message}
          </p>
        )}
        {platforms?.map((p) => {
          const connected = p.accounts.filter((a) => a.connected).length;
          return (
            <Card key={p.id} className="flex flex-col gap-3 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#FFF1EA] text-brand" aria-hidden="true"><Satellite size={21} /></span>
                  <div>
                    <h2 className="text-lg font-semibold leading-tight">{p.name}</h2>
                    <p className="text-[13px] text-muted">{p.server.replace(/^https?:\/\//, "")}</p>
                  </div>
                </div>
                <span className="text-[13.5px] text-muted">
                  {p.accounts.length === 0 ? "No accounts yet" : `${p.accounts.length} account${p.accounts.length === 1 ? "" : "s"} · ${connected} connected`}
                </span>
              </div>

              {p.accounts.length > 0 && (
                <ul aria-label={`${p.name} accounts`} className="divide-y divide-line border-t border-line">
                  {p.accounts.map((a) => (
                    <AccountRow key={a.id} a={a} platform={p} setNote={setNote}
                      onChange={(x) => patch(p.id, (list) => list.map((y) => (y.id === x.id ? x : y)))}
                      onRemoved={(id) => patch(p.id, (list) => list.filter((y) => y.id !== id))} />
                  ))}
                </ul>
              )}

              {adding === p.id ? (
                <AccountForm platform={p} onCancel={() => setAdding(null)}
                  onDone={(a, message) => { setAdding(null); patch(p.id, (list) => [...list, a]); setNote({ ok: true, message }); }} />
              ) : (
                <div>
                  <button type="button" onClick={() => { setAdding(p.id); setNote(null); }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold hover:bg-canvas">
                    <Plus size={17} aria-hidden="true" />Add account
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
