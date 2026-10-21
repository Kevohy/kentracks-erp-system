import { Card } from "@/components/dashboard/Card";

export type GateState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

/** Shown instead of a sale form while the data it chooses from is loading, or when loading failed. */
export function LoadGate({ states, retry }: { states: GateState[]; retry: () => void }) {
  const failed = states.find((s) => s.status === "error");
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {failed && failed.status === "error" ? (
        <div role="alert" className="flex flex-col items-center gap-3">
          <p className="text-[#C62828]">{failed.message}</p>
          <button type="button" onClick={retry} className="min-h-11 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-canvas">
            Try again
          </button>
        </div>
      ) : (
        <p role="status" className="text-muted">Loading…</p>
      )}
    </Card>
  );
}

export const notReady = (states: GateState[]) => states.some((s) => s.status !== "ready");
