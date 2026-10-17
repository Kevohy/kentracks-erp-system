import { Plus } from "lucide-react";

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:brightness-95"
    >
      <Plus size={18} aria-hidden="true" />
      {label}
    </button>
  );
}
