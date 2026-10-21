"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HandCoins, Loader2, PackageMinus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { todayInNairobi } from "@/lib/billing";
import { erpApi } from "@/lib/erp-api";
import type { Sale } from "@/lib/sales";
import type { SalePayments } from "@/lib/sale-payments";
import { formatKes, formatSigned, paymentState } from "@/lib/sales-format";
import { RecordPaymentForm, nairobiDay } from "./RecordPaymentForm";

const statusStyle = { "Paid in full": "bg-[#E6F4EA] text-[#1B5E20]", "Partly paid": "bg-[#FFF4E5] text-[#9a3300]", Unpaid: "bg-[#FDECEA] text-[#B71C1C]" } as const;

export const formatSaleDate = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Item({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={cn("break-words text-[14.5px] font-medium", mono && "font-mono text-[13.5px]")}>{value === "" || value == null ? <span className="font-normal text-muted">—</span> : value}</dd>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[14px] text-muted">{label}</span>
      <span className={cn("tabular-nums text-[14.5px]", strong && "font-semibold", tone === "good" && "text-[#1B5E20]", tone === "bad" && "text-[#B71C1C]")}>{value}</span>
    </div>
  );
}

const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Everything recorded for one sale, including what it took out of inventory and its payments. A sale not paid in full
 * can record a payment here; `onUpdated` gets the sale with its new amount paid.
 */
export function SaleDetailsDialog({
  sale,
  onClose,
  onUpdated,
  startWithPayment = false,
}: {
  sale: Sale | null;
  onClose: () => void;
  onUpdated?: (sale: Sale) => void;
  /** Open with the Record payment form showing (from the list's Record payment button). */
  startWithPayment?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = sale?.id;
  const [payments, setPayments] = useState<SalePayments | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const isOld = !!sale && sale.type !== "Retailer Sale" && sale.oldSale;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (sale && !d.open) d.showModal();
    else if (!sale && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Payments of the sale on view (old sales have none).
  useEffect(() => {
    let live = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    setPayments(null);
    setPaymentsError(null);
    setNotice(null);
    setPaying(!!id && startWithPayment && !isOld && !!sale && sale.paidMinor < sale.totalMinor);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!id || isOld) return;
    void erpApi.sales.payments(id).then((r) => {
      if (!live) return;
      if (r.ok) setPayments(r.data);
      else setPaymentsError(r.message);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const st = sale ? paymentState(sale) : null;
  const old = !!sale && sale.type !== "Retailer Sale" && sale.oldSale;
  // A licence sold with deduction 0 takes nothing from stock, but is still listed (as 0) so the record is complete.
  const taken =
    sale && sale.type !== "Retailer Sale" && sale.licence.deduction === 0 && !sale.stockTaken.some((t) => t.itemType === "Platform")
      ? [...sale.stockTaken, { itemType: "Platform" as const, name: sale.licence.platformName, quantity: 0 }]
      : (sale?.stockTaken ?? []);
  const pkg = sale && sale.type !== "Retailer Sale" ? sale : null;
  const ret = sale && sale.type === "Retailer Sale" ? sale : null;
  const expensesTotal = pkg ? pkg.expensesMinor.installation + pkg.expensesMinor.transport + pkg.expensesMinor.commission + pkg.expensesMinor.other.reduce((s, o) => s + o.amountMinor, 0) : 0;
  const costTotal = pkg ? pkg.costMinor.tracker + pkg.costMinor.sim + pkg.costMinor.licence : ret ? ret.costMinor : 0;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="sale-details-title"
      className="m-auto w-[calc(100%-24px)] max-w-2xl rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_24px_60px_rgba(10,29,44,0.25)] backdrop:bg-ink/50"
    >
      {sale && st && (
        <div className="flex max-h-[calc(100dvh-24px)] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-muted">
                {sale.type} · {formatSaleDate(sale.createdAt)}
              </p>
              <h2 id="sale-details-title" className="truncate text-lg font-semibold">
                {sale.customerName}
              </h2>
              {old
                ? <span className="mt-1 inline-block rounded-full bg-tint px-2.5 py-0.5 text-[12.5px] font-semibold text-navy">Old sale</span>
                : <span className={cn("mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", statusStyle[st])}>{st}</span>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-canvas">
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5 sm:px-6">
            {!old && (
              <Section title="Payments">
                {notice && <p role="status" className="rounded-xl bg-[#E6F4EA] px-4 py-3 text-[14px] text-[#1B5E20]">{notice}</p>}
                {paymentsError && <p role="alert" className="text-[14px] text-[#C62828]">{paymentsError}</p>}
                {!payments && !paymentsError && (
                  <p role="status" className="flex items-center gap-2 text-[14px] text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading payments…</p>
                )}
                {payments && (
                  <ul aria-label="Payments" className="flex flex-col divide-y divide-line rounded-xl border border-line">
                    <li className="flex items-baseline justify-between gap-3 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block text-[14.5px] font-medium">Paid at sale</span>
                        <span className="block text-[12.5px] text-muted">{shortDay(nairobiDay(sale.createdAt))}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatKes(payments.atSaleMinor)}</span>
                    </li>
                    {payments.payments.map((p) => (
                      <li key={p.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                        <span className="min-w-0">
                          <span className="block text-[14.5px] font-medium">{p.method}{p.reference ? <span className="font-mono text-[13px] text-muted"> · {p.reference}</span> : null}</span>
                          <span className="block text-[12.5px] text-muted">
                            {shortDay(p.paidOn)}{p.recordedBy ? ` · recorded by ${p.recordedBy}` : ""}
                          </span>
                          {p.note && <span className="block break-words text-[13px] text-muted">{p.note}</span>}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-[#1B5E20]">+{formatKes(p.amountMinor)}</span>
                      </li>
                    ))}
                    <li className="flex items-baseline justify-between gap-3 bg-canvas/60 px-4 py-3">
                      <span className="text-[14.5px] font-semibold">Balance</span>
                      <span className={cn("shrink-0 font-semibold tabular-nums", payments.balanceMinor > 0 ? "text-[#9a3300]" : "text-[#1B5E20]")}>
                        {payments.balanceMinor > 0 ? formatKes(payments.balanceMinor) : "Paid in full"}
                      </span>
                    </li>
                  </ul>
                )}
                {payments && payments.balanceMinor > 0 && (paying ? (
                  <RecordPaymentForm
                    sale={sale}
                    balanceMinor={payments.balanceMinor}
                    today={todayInNairobi()}
                    onCancel={() => setPaying(false)}
                    onSaved={(r) => {
                      setPayments(r.payments);
                      setPaying(false);
                      setNotice(r.payments.balanceMinor > 0 ? `Payment saved. Balance now ${formatKes(r.payments.balanceMinor)}.` : "Payment saved. This sale is now paid in full.");
                      onUpdated?.(r.sale);
                    }}
                  />
                ) : (
                  <div>
                    <button type="button" onClick={() => { setPaying(true); setNotice(null); }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:brightness-95">
                      <HandCoins size={18} aria-hidden="true" />
                      Record payment
                    </button>
                  </div>
                ))}
              </Section>
            )}

            <Section title="Taken from inventory">
              {old ? (
                <p className="rounded-xl bg-canvas px-4 py-3 text-[14px] text-muted">Old sale: nothing was taken from inventory.</p>
              ) : taken.length === 0 ? (
                <p className="rounded-xl bg-canvas px-4 py-3 text-[14px] text-muted">Nothing was deducted from stock for this sale.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
                  {taken.map((t, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <PackageMinus size={18} className="shrink-0 text-brand" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-[14.5px] font-medium">
                            {t.itemType === "Platform" && pkg ? `${t.name} — ${pkg.licence.cardType}` : t.name}
                          </span>
                          <span className="block text-[12.5px] text-muted">{t.itemType === "Platform" ? "Platform licence" : t.itemType}</span>
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{t.quantity === 0 ? "0" : `−${t.quantity}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {pkg && (
              <>
                <Section title="Device">
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    <Item label="IMEI" value={pkg.imei} mono />
                    <Item label="Vehicle plate" value={pkg.vehiclePlate} />
                    <Item label="GPS account" value={pkg.gpsAccount} />
                    <Item label="Verification" value={pkg.verificationSource === "mock" ? "Mock data (not a GPS platform)" : (pkg.verificationPlatform ?? "Kentracks")} />
                    <Item label="Customer link" value={pkg.customerLink === "automatic" ? "Matched automatically" : "Chosen manually"} />
                    <Item label="Technician" value={pkg.technician?.name ?? ""} />
                  </dl>
                </Section>
                <Section title="Package">
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    <Item label="Package" value={pkg.packageName} />
                    {pkg.tracker && <Item label="GPS tracker" value={pkg.tracker.model} />}
                    <Item label="Platform licence" value={`${pkg.licence.platformName} — ${pkg.licence.cardType}`} />
                    {pkg.licence.expirationDate && <Item label="Platform expiration date" value={pkg.licence.expirationDate} />}
                    {pkg.licence.renewalFeeMinor != null && <Item label="Renewal fee" value={formatKes(pkg.licence.renewalFeeMinor)} />}
                    <Item label="SIM card" value={`${pkg.sim.name}${pkg.sim.number ? ` — ${pkg.sim.number}` : ""}`} />
                    {(pkg.sim.smsReminder || pkg.sim.autoRecharge) && (
                      <Item label="Airtime service" value={pkg.sim.smsReminder ? "Monthly airtime alert (SMS)" : "Automatic airtime recharge"} />
                    )}
                    {pkg.sim.iotBilling && <Item label="Billing" value="Billing → IoT SIM" />}
                    {pkg.notes && <div className="sm:col-span-2"><Item label="Notes" value={pkg.notes} /></div>}
                  </dl>
                </Section>
              </>
            )}

            {ret && (
              <Section title="Items sold">
                <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
                  {ret.productLines.map((l, i) => (
                    <li key={`p${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block text-[14.5px] font-medium">{l.model}</span>
                        <span className="block text-[12.5px] text-muted">{l.categoryName}</span>
                      </span>
                      <span className="tabular-nums text-[14px] text-muted">
                        {l.quantity} × {formatKes(l.unitPriceMinor)} = <span className="font-semibold text-ink">{formatKes(l.lineTotalMinor)}</span>
                      </span>
                    </li>
                  ))}
                  {ret.cardLines.map((l, i) => (
                    <li key={`c${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block text-[14.5px] font-medium">{l.platformName}</span>
                        <span className="block text-[12.5px] text-muted">{l.cardType}</span>
                      </span>
                      <span className="tabular-nums text-[14px] text-muted">
                        {l.quantity} × {formatKes(l.unitPriceMinor)} = <span className="font-semibold text-ink">{formatKes(l.lineTotalMinor)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {old ? (
              <Section title="Money">
                <p className="rounded-xl bg-canvas px-4 py-3 text-[14px] text-muted">
                  Recorded for tracking only (sold before this system, on {formatSaleDate(sale.createdAt)}). It is not counted in revenue, balance or profit.
                </p>
              </Section>
            ) : (
            <Section title="Money">
              <div className="rounded-xl bg-canvas px-4 py-2">
                <Row label="Total" value={formatKes(sale.totalMinor)} strong />
                <Row label="Amount paid" value={formatKes(sale.paidMinor)} />
                <Row label="Balance" value={formatKes(sale.totalMinor - sale.paidMinor)} strong />
                <div className="my-1 border-t border-line" />
                <Row label="Cost of items" value={formatKes(costTotal)} />
                {pkg && <Row label="Expenses" value={formatKes(expensesTotal)} />}
                <Row label="Profit" value={formatSigned(sale.profitMinor)} strong tone={sale.profitMinor < 0 ? "bad" : "good"} />
              </div>
              {sale.costMissing.length > 0 && (
                <p className="text-[13px] text-muted">No buying price was recorded for: {sale.costMissing.join(", ")}. The profit does not include their cost.</p>
              )}
            </Section>
            )}
          </div>

          <div className="flex justify-end border-t border-line px-5 py-4 sm:px-6">
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-line px-5 text-[15px] font-semibold hover:bg-canvas">
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
