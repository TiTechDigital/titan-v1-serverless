"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";

export function Slider({
  label, value, min, max, step = 1, onChange, format, hint,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; format?: (v: number) => string; hint?: string;
}) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-mute">{label}</span>
        <span className="num text-[13px] text-fg">{format ? format(value) : value}</span>
      </div>
      <input
        type="range" className="titan-range" min={min} max={max} step={step} value={value}
        style={{ "--p": `${p}%` } as CSSProperties} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="mt-2 text-[12px] leading-snug text-dim">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value, options, onChange, label,
}: {
  value: T; label: string;
  options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="seg" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="seg-item" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pill that opens a panel above it (the prompt bar sits at the bottom). Closes on outside click or Escape. */
export function Pop({
  trigger, label, children, width = "w-64", align = "left",
}: {
  trigger: ReactNode; label: string; width?: string; align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" className="pill" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      {open && (
        <div role="dialog" aria-label={label}
          className={`absolute bottom-full z-40 mb-2 max-h-[60vh] max-w-[90vw] overflow-y-auto rounded-2xl border border-white/10 bg-[#161616] p-2 shadow-2xl shadow-black ${width} ${align === "left" ? "left-0" : "right-0"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function Row({ active, onClick, title, sub, right }: { active?: boolean; onClick: () => void; title: string; sub?: string; right?: ReactNode }) {
  return (
    <button type="button" aria-pressed={!!active} onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]">
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold">{title}</span>
        {sub && <span className="block text-[12px] text-mute">{sub}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-[12px] text-mute">
        {right}
        {active && <Check size={15} className="text-cobalt-ice" />}
      </span>
    </button>
  );
}
