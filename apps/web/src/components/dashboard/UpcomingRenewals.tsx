import { renewals } from "@/lib/sample-data";
import { Panel } from "./Card";

export function UpcomingRenewals() {
  return (
    <Panel title="Upcoming renewals" subtitle="Next 14 days">
      <ul className="flex flex-col">
        {renewals.map((r) => (
          <li
            key={r.name}
            className="flex items-center gap-3.5 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-tint text-[13.5px] font-semibold text-navy">
              {r.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.name}</div>
              <div className="text-[13.5px] text-muted">{r.when}</div>
            </div>
            <div className="whitespace-nowrap font-semibold tabular-nums">{r.amount}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
