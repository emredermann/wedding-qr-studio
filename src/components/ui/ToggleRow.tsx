"use client";

import { ui } from "@/components/ui/styles";

/** Checkbox + title + optional description; the box keeps its size and aligns with the title. */
export function ToggleRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-stone-50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={`mt-px ${ui.checkbox}`} />
      <span className="min-w-0">
        <span className="block text-sm leading-5 font-medium text-stone-900">{label}</span>
        {hint && <span className={`mt-0.5 block ${ui.hint}`}>{hint}</span>}
      </span>
    </label>
  );
}
