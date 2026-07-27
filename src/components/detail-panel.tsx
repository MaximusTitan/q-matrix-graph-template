"use client";

import { useEffect, useMemo, useState } from "react";

import { loadDetails } from "@/lib/graph";
import { SUBJECT_SHORT, subjectColor } from "@/lib/palette";
import { LEVEL_LABEL, type ConceptDetail, type Level, type SimNode } from "@/lib/types";

interface DetailPanelProps {
  node: SimNode;
  nodesById: Map<string, SimNode>;
  dependents: string[];
  focused: boolean;
  onToggleFocus: () => void;
  onSelect: (node: SimNode) => void;
  onClose: () => void;
}

export default function DetailPanel({
  node,
  nodesById,
  dependents,
  focused,
  onToggleFocus,
  onSelect,
  onClose,
}: DetailPanelProps) {
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Details arrive from a separate lazily-fetched file, so a node can be
  // selected before its detail exists. `cancelled` stops a slow response for a
  // previous node overwriting a newer selection.
  //
  // There is no reset of `detail` here on purpose: the parent keys this
  // component by node id, so selecting a different concept remounts it with
  // fresh state rather than showing the previous concept's skills while the
  // new ones load.
  useEffect(() => {
    let cancelled = false;

    loadDetails()
      .then((data) => {
        if (!cancelled) setDetail(data.details[node.id] ?? { skills: [], prereqs: [] });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [node.id]);

  const prereqsByLevel = useMemo(() => {
    const grouped = new Map<Level, { node: SimNode; reason: string | null; derived: boolean }[]>();
    for (const prereq of detail?.prereqs ?? []) {
      const source = nodesById.get(prereq.from);
      if (!source) continue;
      if (!grouped.has(prereq.level)) grouped.set(prereq.level, []);
      grouped.get(prereq.level)!.push({
        node: source,
        reason: prereq.reason,
        derived: prereq.derived,
      });
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
  }, [detail, nodesById]);

  const accent = subjectColor(node.subject);

  return (
    <aside className="pointer-events-auto flex h-full w-full flex-col border-l border-white/10 bg-[#16160f]/95 backdrop-blur-sm sm:w-[27rem]">
      <header className="border-b border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#a3a297]">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: accent }}
              />
              <span>{SUBJECT_SHORT[node.subject] ?? node.subject}</span>
              <span aria-hidden>·</span>
              <span>{node.gradeLabel}</span>
            </div>
            <h2 className="mt-2 text-lg leading-snug font-medium text-[#f4f3ec]">{node.label}</h2>
            <p className="mt-1 text-xs text-[#a3a297]">
              {node.chapterOrder !== null ? `Chapter ${node.chapterOrder} · ` : ""}
              {node.chapterLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close concept details"
            className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-[#a3a297] hover:bg-white/10 hover:text-[#f4f3ec]"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleFocus}
            aria-pressed={focused}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              focused
                ? "border-transparent bg-[#f4f3ec] text-[#12120f]"
                : "border-white/15 text-[#e2e1d6] hover:bg-white/10"
            }`}
          >
            {focused ? "Clear focus" : "Focus this chain"}
          </button>
          <Stat value={node.skillCount} label={node.skillCount === 1 ? "skill" : "skills"} />
          <Stat value={node.inDeg} label="requires" />
          <Stat value={node.outDeg} label="unlocks" />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error && (
          <p role="alert" className="rounded-md border border-[#e66767]/40 bg-[#e66767]/10 p-3 text-xs text-[#f0b8b8]">
            Could not load concept details: {error}
          </p>
        )}

        {!detail && !error && <p className="text-xs text-[#a3a297]">Loading details…</p>}

        {detail && (
          <>
            <Section title={`Skills taught (${detail.skills.length})`}>
              <ul className="space-y-2">
                {detail.skills.map((skill) => (
                  <li key={skill} className="flex gap-2 text-sm leading-snug text-[#e2e1d6]">
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#6f6e64]" />
                    {skill}
                  </li>
                ))}
              </ul>
            </Section>

            {prereqsByLevel.map(([level, items]) => (
              <Section key={level} title={`${LEVEL_LABEL[level]} (${items.length})`}>
                <ul className="space-y-3">
                  {items.map((item) => (
                    <li key={`${item.node.id}-${level}`}>
                      <button
                        type="button"
                        onClick={() => onSelect(item.node)}
                        className="w-full rounded-md border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-white/25 hover:bg-white/[0.07]"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            aria-hidden
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: subjectColor(item.node.subject) }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm leading-snug text-[#f4f3ec]">{item.node.label}</div>
                            <div className="mt-0.5 text-[11px] text-[#a3a297]">
                              {SUBJECT_SHORT[item.node.subject] ?? item.node.subject} ·{" "}
                              {item.node.gradeLabel} · {item.node.chapterLabel}
                              {item.derived && (
                                <span
                                  className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                                  title="Inferred from a skill-level prerequisite rather than stated directly between concepts"
                                >
                                  inferred
                                </span>
                              )}
                            </div>
                            {item.reason && (
                              <p className="mt-1.5 text-xs leading-relaxed text-[#a3a297]">{item.reason}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            ))}

            {dependents.length > 0 && (
              <Section title={`Unlocks (${dependents.length})`}>
                <ul className="space-y-1.5">
                  {dependents.map((id) => {
                    const target = nodesById.get(id);
                    if (!target) return null;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => onSelect(target)}
                          className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white/[0.07]"
                        >
                          <span
                            aria-hidden
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: subjectColor(target.subject) }}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm leading-snug text-[#e2e1d6]">{target.label}</span>
                            <span className="block text-[11px] text-[#a3a297]">
                              {SUBJECT_SHORT[target.subject] ?? target.subject} · {target.gradeLabel}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="rounded-md bg-white/[0.06] px-2 py-1.5 text-xs text-[#a3a297]">
      <strong className="font-medium text-[#f4f3ec]">{value}</strong> {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-[#8f8e83]">{title}</h3>
      {children}
    </section>
  );
}
