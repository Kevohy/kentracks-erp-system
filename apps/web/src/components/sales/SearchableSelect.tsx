"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Field, controlClass } from "./fields";

type Option = { value: string; label: string };

/**
 * A select with a search box inside its dropdown. Type to filter, use the arrow keys and Enter
 * (or click) to choose, Escape to close. `filter` decides whether an option matches the search text.
 */
export function SearchableSelect({
  id, name, label, value, onChange, options, error, placeholder = "Select…", searchPlaceholder = "Search…", emptyText = "No matches", filter,
}: {
  id: string; name?: string; label: string; value: string; onChange: (v: string) => void; options: Option[];
  error?: string; placeholder?: string; searchPlaceholder?: string; emptyText?: string;
  filter?: (option: Option, query: string) => boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? options.filter((o) => (filter ? filter(o, q) : o.label.toLowerCase().includes(q))) : options),
    [options, q, filter],
  );
  const selected = options.find((o) => o.value === value);

  function openList() {
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close(focusTrigger: boolean) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function choose(o: Option) {
    onChange(o.value);
    close(true);
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const away = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <Field id={id} label={label} error={error}>
      <div ref={rootRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          id={id}
          data-field={name ?? id}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onClick={() => (open ? close(false) : openList())}
          onKeyDown={(e) => {
            if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              openList();
            }
          }}
          className={cn(controlClass, "flex items-center justify-between gap-2 text-left", error ? "border-[#C62828]" : "border-line")}
        >
          <span className={cn("truncate", !selected && "text-muted/70")}>{selected ? selected.label : placeholder}</span>
          <ChevronDown size={18} aria-hidden="true" className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-white shadow-[0_12px_32px_rgba(10,29,44,0.16)]">
            <div className="flex items-center gap-2 border-b border-line px-3.5">
              <Search size={16} aria-hidden="true" className="shrink-0 text-muted" />
              <input
                ref={inputRef}
                type="text"
                role="searchbox"
                aria-label={`Search ${label}`}
                aria-controls={listId}
                aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
                value={query}
                placeholder={searchPlaceholder}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onSearchKey}
                className="min-h-11 w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
              />
            </div>
            <ul id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto py-1">
              {shown.length === 0 && <li className="px-4 py-3 text-[14px] text-muted">{emptyText}</li>}
              {shown.map((o, i) => (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-[15px]",
                    i === active && "bg-canvas",
                    o.value === value && "font-semibold",
                  )}
                >
                  <span className="min-w-0 break-words">{o.label}</span>
                  {o.value === value && <Check size={16} aria-hidden="true" className="shrink-0 text-brand" />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Field>
  );
}
