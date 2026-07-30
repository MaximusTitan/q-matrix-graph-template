"use client";

import { useState } from "react";

import { LAYOUT_MODES, type LayoutMode } from "@/lib/layout";
import { LEVEL_STYLE, LINK_BASE_RGB, SUBJECT_ORDER, SUBJECT_SHORT, subjectColor } from "@/lib/palette";
import { LEVEL_LABEL, type GraphMeta, type Level } from "@/lib/types";

/**
 * Identity is never carried by colour alone: the legend is always present, and
 * every coloured mark in the UI is paired with its subject name in text.
 */
export default function Legend({ meta, mode }: { meta: GraphMeta; mode: LayoutMode }) {
  const [showAbout, setShowAbout] = useState(false);
  const integrity = meta.integrity;

  return (
    <div className="pointer-events-auto w-64 rounded-xl border border-white/10 bg-[#16160f]/92 p-4 backdrop-blur-sm">
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#8f8e83]">Subject</h2>
      <ul className="mb-4 space-y-1.5">
        {SUBJECT_ORDER.map((subject) => (
          <li key={subject} className="flex items-center gap-2.5 text-xs text-[#e2e1d6]">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: subjectColor(subject) }}
            />
            {SUBJECT_SHORT[subject] ?? subject}
            <span className="ml-auto text-[11px] text-[#8f8e83]">
              {Object.values(meta.inventory[subject] ?? {})
                .reduce((sum, g) => sum + g.concepts, 0)
                .toLocaleString()}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#8f8e83]">
        Prerequisite link
      </h2>
      <ul className="space-y-1.5">
        {([1, 2, 3] as Level[]).map((level) => (
          <li key={level} className="flex items-center gap-2.5 text-xs text-[#e2e1d6]">
            <span
              aria-hidden
              className="h-0.5 w-6 shrink-0 rounded-full"
              style={{
                backgroundColor: `rgba(${LINK_BASE_RGB}, ${Math.min(LEVEL_STYLE[level].opacity * 2.2, 1)})`,
              }}
            />
            {LEVEL_LABEL[level]}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11px] leading-snug text-[#8f8e83]">
        Links point from a prerequisite to what it unlocks.
      </p>

      <h2 className="mt-4 mb-2 text-[11px] font-medium uppercase tracking-wide text-[#8f8e83]">
        Height
      </h2>
      <p className="text-[11px] leading-snug text-[#8f8e83]">
        {LAYOUT_MODES.find((m) => m.value === mode)?.heightMeans}
      </p>

      <button
        type="button"
        onClick={() => setShowAbout((open) => !open)}
        aria-expanded={showAbout}
        className="mt-3 w-full rounded-md border border-white/12 px-2.5 py-1.5 text-[11px] text-[#c5c4b8] transition hover:bg-white/[0.07]"
      >
        {showAbout ? "Hide data summary" : "About this data"}
      </button>

      {showAbout && (
        <dl className="mt-3 space-y-1 border-t border-white/8 pt-3 text-[11px] text-[#8f8e83]">
          <Row label="Board" value={meta.board} />
          <Row label="Chapters" value={integrity.chapterFiles.toLocaleString()} />
          <Row label="Concepts" value={integrity.nodes.toLocaleString()} />
          <Row label="Links" value={integrity.edges.toLocaleString()} />
          <Row label="Cross-subject" value={integrity.crossSubjectEdges.toLocaleString()} />
          <Row label="Unconnected" value={integrity.isolatedNodes.toLocaleString()} />
          <Row label="Inferred links" value={integrity.derivedEdges.toLocaleString()} />
          <Row
            label="Cycles"
            value={`${integrity.cycles.cyclicComponents} (${integrity.cycles.nodesInCycles} concepts)`}
          />
          <Row label="Unresolved refs" value={integrity.unresolvedRefs.toLocaleString()} />
          <Row label="Exported" value={meta.generatedAt?.slice(0, 10) ?? "unknown"} />
        </dl>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-[#c5c4b8]">{value}</dd>
    </div>
  );
}
