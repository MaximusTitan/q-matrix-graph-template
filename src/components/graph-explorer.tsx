"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Controls, { type Filters } from "@/components/controls";
import DetailPanel from "@/components/detail-panel";
import GraphCanvas from "@/components/graph-canvas";
import Legend from "@/components/legend";
import NavToolbar from "@/components/nav-toolbar";
import SearchBox from "@/components/search-box";
import { buildAdjacency, focusSubgraph, loadGraph } from "@/lib/graph";
import { topologicalDepth, type LayoutMode } from "@/lib/layout";
import { isTypingTarget, navShortcut, type NavMode } from "@/lib/nav";
import { SUBJECT_ORDER, type SizeMetric } from "@/lib/palette";
import type { GraphLink, GraphMeta, Level, SimNode } from "@/lib/types";

interface Dataset {
  nodes: SimNode[];
  links: GraphLink[];
  meta: GraphMeta;
}

const DEFAULT_FILTERS: Filters = {
  subjects: new Set(SUBJECT_ORDER),
  levels: new Set<Level>([1, 2, 3]),
  grades: [1, 10],
  hideIsolated: false,
  hideDerived: false,
  crossSubjectOnly: false,
};

export default function GraphExplorer() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [mode, setMode] = useState<LayoutMode>("layered");
  const [sizeMetric, setSizeMetric] = useState<SizeMetric>("skills");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [navMode, setNavMode] = useState<NavMode>("select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [spin, setSpin] = useState(true);
  const canvasApi = useRef<{ fitView: () => void } | null>(null);
  const fitView = useCallback(() => canvasApi.current?.fitView(), []);
  const handleCanvasReady = useCallback((api: { fitView: () => void }) => {
    canvasApi.current = api;
  }, []);
  const pendingDeepLink = useRef<string | null>(null);

  useEffect(() => {
    // Read the deep link straight off the URL rather than through
    // useSearchParams: this page is a static export with no server to render a
    // search-param-aware shell, and an effect avoids the Suspense dance for
    // what is a single read at startup.
    const params = new URLSearchParams(window.location.search);
    pendingDeepLink.current = params.get("node");
    const urlMode = params.get("mode");

    // State from the URL is applied alongside the loaded data rather than
    // immediately: nothing but a loading message renders until the fetch
    // resolves, so there is no reason to trigger an extra render pass first.
    loadGraph()
      .then((loaded) => {
        if (urlMode === "layered" || urlMode === "depth" || urlMode === "free") setMode(urlMode);
        // An empty dataset (no exporter run yet) has no grades to bound the
        // filter by — leave the default range untouched rather than collapsing
        // it to [Infinity, -Infinity].
        if (loaded.nodes.length > 0) {
          const grades = loaded.nodes.map((n) => n.grade);
          setFilters((current) => ({
            ...current,
            grades: [Math.min(...grades), Math.max(...grades)],
          }));
        }
        setData(loaded);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const nodesById = useMemo(() => {
    const map = new Map<string, SimNode>();
    for (const node of data?.nodes ?? []) map.set(node.id, node);
    return map;
  }, [data]);

  // Adjacency spans the whole graph, not the filtered view: focusing a concept
  // should reveal its true prerequisite chain, including any part of it the
  // current filters happen to hide.
  const adjacency = useMemo(() => buildAdjacency(data?.links ?? []), [data]);

  useEffect(() => {
    if (!data || !pendingDeepLink.current) return;
    const target = nodesById.get(pendingDeepLink.current);
    pendingDeepLink.current = null;
    if (target) setSelectedId(target.id);
  }, [data, nodesById]);

  // Keep the URL in step so the current view can be shared or reloaded.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedId) params.set("node", selectedId);
    else params.delete("node");
    if (mode !== "layered") params.set("mode", mode);
    else params.delete("mode");

    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [selectedId, mode]);

  const gradeBounds = useMemo<[number, number]>(() => {
    if (!data) return [1, 10];
    const grades = data.nodes.map((n) => n.grade);
    return [Math.min(...grades), Math.max(...grades)];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return { nodes: [] as SimNode[], links: [] as GraphLink[] };

    const nodes = data.nodes.filter(
      (node) =>
        filters.subjects.has(node.subject) &&
        node.grade >= filters.grades[0] &&
        node.grade <= filters.grades[1] &&
        !(filters.hideIsolated && node.inDeg === 0 && node.outDeg === 0),
    );

    const visible = new Set(nodes.map((n) => n.id));
    const links = data.links.filter((link) => {
      if (!visible.has(link.s) || !visible.has(link.t)) return false;
      if (!filters.levels.has(link.l)) return false;
      if (filters.hideDerived && link.d) return false;
      if (filters.crossSubjectOnly) {
        const source = nodesById.get(link.s);
        const target = nodesById.get(link.t);
        if (!source || !target || source.subject === target.subject) return false;
      }
      return true;
    });

    return { nodes, links };
  }, [data, filters, nodesById]);

  // Depth is a property of the filtered graph — restricting to a grade range
  // genuinely changes what "start of the chain" means — so it is recomputed
  // when that view changes, and only while the depth layout is on screen.
  const depth = useMemo(() => {
    if (mode !== "depth") return undefined;
    return topologicalDepth(filtered.nodes, filtered.links).depth;
  }, [mode, filtered]);

  const focus = useMemo(() => {
    if (!focusId) return null;
    return focusSubgraph(focusId, adjacency);
  }, [focusId, adjacency]);

  const selected = selectedId ? nodesById.get(selectedId) ?? null : null;
  const dependents = useMemo(
    () => (selectedId ? adjacency.out.get(selectedId) ?? [] : []),
    [selectedId, adjacency],
  );

  const handleSelect = useCallback((node: SimNode | null) => {
    setSelectedId(node?.id ?? null);
    if (!node) setFocusId(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if (event.key === "Escape") {
        setSelectedId(null);
        setFocusId(null);
        return;
      }

      // Holding space pans temporarily and springs back on release — the
      // gesture you reach for mid-drag without giving up the current tool.
      // preventDefault stops the browser scrolling the page underneath.
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) setSpaceHeld(true);
        return;
      }

      if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) {
        canvasApi.current?.fitView();
        return;
      }

      const mode = navShortcut(event);
      if (mode) setNavMode(mode);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };

    // A drag can carry the pointer outside the window, and the keyup then
    // lands somewhere else — leaving the canvas stuck in pan. Releasing on
    // blur costs nothing and avoids that dead end.
    const onBlur = () => setSpaceHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const effectiveNavMode: NavMode = spaceHeld ? "move" : navMode;

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div role="alert" className="max-w-md rounded-lg border border-[#e66767]/40 bg-[#e66767]/10 p-5">
          <h1 className="text-sm font-medium text-[#f0b8b8]">Could not load the graph</h1>
          <p className="mt-2 text-xs leading-relaxed text-[#d8a5a5]">{error}</p>
          <p className="mt-3 text-xs leading-relaxed text-[#a3a297]">
            Run the exporter into <code className="text-[#c5c4b8]">public/graph/</code>, then reload.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[#8f8e83]">Loading curriculum graph…</p>
      </div>
    );
  }

  // A successfully loaded but empty dataset means the exporter has never been
  // run against a real KB yet — distinct from a fetch failure, so it gets its
  // own neutral state rather than the red error panel above.
  if (data.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-white/10 bg-white/5 p-5">
          <h1 className="text-sm font-medium text-[#f4f3ec]">No curriculum data yet</h1>
          <p className="mt-2 text-xs leading-relaxed text-[#c5c4b8]">
            <code className="text-[#f4f3ec]">public/graph/</code> has the schema this app expects
            but no concepts in it — this repo ships without any curriculum content.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-[#8f8e83]">
            Point <code className="text-[#c5c4b8]">KB_ROOT</code> at your own knowledge base and run{" "}
            <code className="text-[#c5c4b8]">npm run sync:graph</code>, then reload.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <GraphCanvas
        nodes={filtered.nodes}
        links={filtered.links}
        mode={mode}
        depth={depth}
        sizeMetric={sizeMetric}
        focus={focus}
        selectedId={selectedId}
        navMode={effectiveNavMode}
        spin={spin}
        onSelect={handleSelect}
        onReady={handleCanvasReady}
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <header className="pointer-events-none flex items-start justify-between gap-4 p-4">
          <div className="pointer-events-auto">
            <h1 className="text-sm font-medium text-[#f4f3ec]">{data.meta.board} Curriculum Knowledge Graph</h1>
            <p className="mt-0.5 text-xs text-[#8f8e83]">
              {data.meta.integrity.nodes.toLocaleString()} concepts ·{" "}
              {data.meta.integrity.edges.toLocaleString()} prerequisite links · Grades 1–10
            </p>
          </div>
          <div className="pointer-events-none flex items-start gap-3">
            <NavToolbar
              mode={navMode}
              spaceHeld={spaceHeld}
              onMode={setNavMode}
              onFitView={fitView}
              spin={spin}
              onSpin={setSpin}
            />
            <SearchBox nodes={data.nodes} onSelect={handleSelect} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 items-stretch justify-between gap-4 p-4 pt-0">
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-1">
            <Controls
              filters={filters}
              onFilters={setFilters}
              mode={mode}
              onMode={setMode}
              sizeMetric={sizeMetric}
              onSizeMetric={setSizeMetric}
              gradeBounds={gradeBounds}
              visibleNodes={filtered.nodes.length}
              visibleLinks={filtered.links.length}
              totalNodes={data.nodes.length}
              totalLinks={data.links.length}
            />
            <Legend meta={data.meta} mode={mode} />
          </div>

          {selected && (
            <div className="pointer-events-auto min-h-0 w-full max-w-[27rem] overflow-hidden rounded-xl border border-white/10">
              <DetailPanel
                key={selected.id}
                node={selected}
                nodesById={nodesById}
                dependents={dependents}
                focused={focusId === selected.id}
                onToggleFocus={() => setFocusId((current) => (current === selected.id ? null : selected.id))}
                onSelect={handleSelect}
                onClose={() => handleSelect(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
