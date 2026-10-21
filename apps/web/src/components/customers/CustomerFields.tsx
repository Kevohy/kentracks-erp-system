"use client";

import { cn } from "@/lib/cn";
import type { Brand } from "@/lib/brands";
import { fieldsByType, type CustomerType, type FieldName } from "@/lib/customers";

export type Values = Partial<Record<FieldName, string>>;

export function CustomerFields({
  type,
  values,
  errors,
  onChange,
  onBlur,
  brands,
  idPrefix,
}: {
  type: CustomerType;
  values: Values;
  errors: Values;
  onChange: (name: FieldName, raw: string) => void;
  onBlur: (name: FieldName) => void;
  brands: Brand[];
  /** Keeps field ids unique when the add and edit dialogs are both on the page. */
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor={`${idPrefix}-brandId`} className="text-[13.5px] font-medium">
          Brand
        </label>
        <select
          id={`${idPrefix}-brandId`}
          name="brandId"
          value={values.brandId ?? ""}
          onChange={(e) => onChange("brandId", e.target.value)}
          aria-invalid={errors.brandId ? true : undefined}
          aria-describedby={errors.brandId ? `${idPrefix}-brandId-err` : undefined}
          className={cn("min-h-11 rounded-xl border bg-white px-3.5 text-[15px]", errors.brandId ? "border-[#C62828]" : "border-line")}
        >
          <option value="">Select…</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {errors.brandId && (
          <p id={`${idPrefix}-brandId-err`} className="text-[13px] text-[#C62828]">
            {errors.brandId}
          </p>
        )}
      </div>
      {fieldsByType[type].map((f) => {
        const id = `${idPrefix}-${f.name}`;
        return (
          <div key={`${type}-${f.name}`} className={cn("flex flex-col gap-1.5", f.wide && "sm:col-span-2")}>
            <label htmlFor={id} className="text-[13.5px] font-medium">
              {f.label}
            </label>
            <input
              id={id}
              name={f.name}
              type={f.type}
              autoComplete="off"
              placeholder={f.placeholder}
              value={values[f.name] ?? ""}
              onChange={(e) => onChange(f.name, e.target.value)}
              onBlur={() => onBlur(f.name)}
              spellCheck={false}
              autoCapitalize="off"
              inputMode={f.type === "tel" ? "tel" : f.type === "email" ? "email" : undefined}
              aria-invalid={errors[f.name] ? true : undefined}
              aria-describedby={errors[f.name] ? `${id}-err` : undefined}
              className={cn(
                "min-h-11 rounded-xl border bg-white px-3.5 text-[15px] placeholder:text-muted/70",
                errors[f.name] ? "border-[#C62828]" : "border-line",
              )}
            />
            {errors[f.name] && (
              <p id={`${id}-err`} className="text-[13px] text-[#C62828]">
                {errors[f.name]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
