"use client";

import { SIZE_METRICS, SUBJECT_ORDER, SUBJECT_SHORT, subjectColor, type SizeMetric } from "@/lib/palette";
import { LAYOUT_MODES, type LayoutMode } from "@/lib/layout";
import { LEVEL_LABEL, type Level } from "@/lib/types";

export interface Filters {
  subjects: Set<string>;
  levels: Set<Level>;
  grades: [number, number];
  hideIsolated: boolean;
  hideDerived: boolean;
  crossSubjectOnly: boolean;
}

interface ControlsProps {
  filters: Filters;
  onFilters: (next: Filters) => void;
  mode: LayoutMode;
  onMode: (mode: LayoutMode) => void;
  sizeMetric: SizeMetric;
  onSizeMetric: (metric: SizeMetric) => void;
  gradeBounds: [number, number];
  visibleNodes: number;
  visibleLinks: number;
  totalNodes: number;
  totalLinks: number;
}

export default function Controls({
  filters,
  onFilters,
  mode,
  onMode,
  sizeMetric,
  onSizeMetric,
  gradeBounds,
  visibleNodes,
  visibleLinks,
  totalNodes,
  totalLinks,
}: ControlsProps) {
  const update = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });

  const toggleSubject = (subject: string) => {
    const next = new Set(filters.subjects);
    // Never let the last subject be switched off — an empty canvas reads as a
    // broken page rather than as a filter result.
    if (next.has(subject)) {
      if (next.size === 1) return;
      next.delete(subject);
    } else {
      next.add(subject);
    }
    update({ subjects: next });
  };

  const toggleLevel = (level: Level) => {
    const next = new Set(filters.levels);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    update({ levels: next });
  };

  return (
    <div className="pointer-events-auto w-72 space-y-5 rounded-xl border border-white/10 bg-[#16160f]/92 p-4 backdrop-blur-sm">
      <Group label="Layout">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.06] p-1">
          {LAYOUT_MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.hint}
              aria-pressed={mode === option.value}
              onClick={() => onMode(option.value)}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                mode === option.value
                  ? "bg-[#f4f3ec] text-[#12120f]"
                  : "text-[#c5c4b8] hover:bg-white/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Group>

      <Group label="Node size">
        <select
          value={sizeMetric}
          onChange={(event) => onSizeMetric(event.target.value as SizeMetric)}
          className="w-full rounded-lg border border-white/12 bg-[#12120f] px-2.5 py-2 text-xs text-[#e2e1d6] outline-none focus:border-white/35"
        >
          {SIZE_METRICS.map((metric) => (
            <option key={metric.value} value={metric.value}>
              {metric.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[11px] leading-snug text-[#8f8e83]">
          {SIZE_METRICS.find((m) => m.value === sizeMetric)?.hint}
        </p>
      </Group>

      <Group label="Subjects">
        <div className="space-y-1">
          {SUBJECT_ORDER.map((subject) => (
            <button
              key={subject}
              type="button"
              aria-pressed={filters.subjects.has(subject)}
              onClick={() => toggleSubject(subject)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition ${
                filters.subjects.has(subject)
                  ? "text-[#f4f3ec] hover:bg-white/[0.07]"
                  : "text-[#6f6e64] hover:bg-white/[0.04]"
              }`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: filters.subjects.has(subject) ? subjectColor(subject) : "transparent",
                  boxShadow: `inset 0 0 0 1.5px ${subjectColor(subject)}`,
                }}
              />
              {SUBJECT_SHORT[subject] ?? subject}
            </button>
          ))}
        </div>
      </Group>

      <Group label={`Grades ${filters.grades[0]}–${filters.grades[1]}`}>
        <div className="space-y-2">
          <RangeInput
            label="From"
            value={filters.grades[0]}
            min={gradeBounds[0]}
            max={filters.grades[1]}
            onChange={(v) => update({ grades: [v, filters.grades[1]] })}
          />
          <RangeInput
            label="To"
            value={filters.grades[1]}
            min={filters.grades[0]}
            max={gradeBounds[1]}
            onChange={(v) => update({ grades: [filters.grades[0], v] })}
          />
        </div>
      </Group>

      <Group label="Prerequisite links">
        <div className="space-y-1">
          {([1, 2, 3] as Level[]).map((level) => (
            <Check
              key={level}
              checked={filters.levels.has(level)}
              onChange={() => toggleLevel(level)}
              label={LEVEL_LABEL[level]}
            />
          ))}
        </div>
        <div className="mt-2 space-y-1 border-t border-white/8 pt-2">
          <Check
            checked={filters.crossSubjectOnly}
            onChange={() => update({ crossSubjectOnly: !filters.crossSubjectOnly })}
            label="Cross-subject links only"
          />
          <Check
            checked={filters.hideDerived}
            onChange={() => update({ hideDerived: !filters.hideDerived })}
            label="Hide inferred links"
          />
          <Check
            checked={filters.hideIsolated}
            onChange={() => update({ hideIsolated: !filters.hideIsolated })}
            label="Hide unconnected concepts"
          />
        </div>
      </Group>

      <p className="border-t border-white/8 pt-3 text-[11px] text-[#8f8e83]">
        Showing {visibleNodes.toLocaleString()} of {totalNodes.toLocaleString()} concepts ·{" "}
        {visibleLinks.toLocaleString()} of {totalLinks.toLocaleString()} links
      </p>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#8f8e83]">{label}</h2>
      {children}
    </section>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-xs text-[#c5c4b8] transition hover:bg-white/[0.05]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-[#f4f3ec]"
      />
      {label}
    </label>
  );
}

function RangeInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-[#8f8e83]">
      <span className="w-8 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 flex-1 accent-[#f4f3ec]"
      />
      <span className="w-5 shrink-0 text-right text-[#e2e1d6]">{value}</span>
    </label>
  );
}
