"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { searchNodes } from "@/lib/graph";
import { SUBJECT_SHORT, subjectColor } from "@/lib/palette";
import type { SimNode } from "@/lib/types";

export default function SearchBox({
  nodes,
  onSelect,
}: {
  nodes: SimNode[];
  onSelect: (node: SimNode) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // A linear scan over a few thousand labels per keystroke is well under a
  // frame, so there is no debounce and no index to invalidate.
  const results = useMemo(() => searchNodes(nodes, query), [nodes, query]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const choose = (node: SimNode) => {
    onSelect(node);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="pointer-events-auto relative w-72">
      <input
        type="search"
        value={query}
        placeholder="Search concepts…"
        aria-label="Search concepts"
        // aria-expanded is only meaningful on a combobox; a bare search input
        // has an implicit textbox role that does not support it.
        role="combobox"
        aria-controls="concept-search-results"
        aria-expanded={open && results.length > 0}
        aria-autocomplete="list"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          // Reset the keyboard cursor here rather than in an effect — the
          // query only ever changes through this handler.
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-white/12 bg-[#16160f]/92 px-3 py-2 text-xs text-[#e2e1d6] backdrop-blur-sm outline-none placeholder:text-[#6f6e64] focus:border-white/35"
      />

      {open && results.length > 0 && (
        <ul
          id="concept-search-results"
          role="listbox"
          className="absolute right-0 z-10 mt-1.5 max-h-96 w-full overflow-y-auto rounded-lg border border-white/12 bg-[#16160f]/97 py-1 backdrop-blur-sm"
        >
          {results.map((node, index) => (
            <li key={node.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(node)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left transition ${
                  index === active ? "bg-white/[0.09]" : "hover:bg-white/[0.05]"
                }`}
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: subjectColor(node.subject) }}
                />
                <span className="min-w-0">
                  <span className="block text-xs leading-snug text-[#f4f3ec]">{node.label}</span>
                  <span className="block text-[11px] text-[#8f8e83]">
                    {SUBJECT_SHORT[node.subject] ?? node.subject} · {node.gradeLabel} ·{" "}
                    {node.chapterLabel}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
