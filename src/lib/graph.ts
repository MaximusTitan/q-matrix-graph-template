/**
 * Loading the exported graph, and the traversals the UI runs over it.
 */

import {
  SCHEMA_VERSION,
  type ConceptDetails,
  type GraphCore,
  type GraphLink,
  type GraphMeta,
  type SimNode,
} from "./types";

/**
 * All three files live under a single base path so the site can be served
 * from a sub-directory (GitHub Pages project sites) by changing one constant.
 */
const GRAPH_BASE = "graph";

async function loadJson<T>(file: string): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}/${file}`);
  if (!response.ok) {
    throw new Error(`Could not load ${file} (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

/**
 * Refuse data from a different exporter contract rather than rendering a
 * subtly wrong graph. A mismatch means the exporter moved and the site did
 * not, which is a deploy mistake worth surfacing loudly.
 */
function assertSchema(name: string, version: number): void {
  if (version !== SCHEMA_VERSION) {
    throw new Error(
      `${name} is schema v${version}, but this site expects v${SCHEMA_VERSION}. ` +
        `Re-run the exporter, or check out a matching version of the site.`,
    );
  }
}

export async function loadGraph(): Promise<{
  nodes: SimNode[];
  links: GraphLink[];
  meta: GraphMeta;
}> {
  const [core, meta] = await Promise.all([
    loadJson<GraphCore>("graph-core.json"),
    loadJson<GraphMeta>("meta.json"),
  ]);

  assertSchema("graph-core.json", core.schemaVersion);
  assertSchema("meta.json", meta.schemaVersion);

  return { nodes: core.nodes.map((n) => ({ ...n })), links: core.links, meta };
}

/**
 * Concept details are fetched only once a node is actually opened. They are
 * the bulk of the corpus by size — every prerequisite carries a sentence of
 * rationale — and the graph draws without them.
 */
let detailsPromise: Promise<ConceptDetails> | null = null;

export function loadDetails(): Promise<ConceptDetails> {
  if (!detailsPromise) {
    detailsPromise = loadJson<ConceptDetails>("concept-details.json").then((data) => {
      assertSchema("concept-details.json", data.schemaVersion);
      return data;
    });
    // A failed fetch must not poison every later attempt.
    detailsPromise.catch(() => {
      detailsPromise = null;
    });
  }
  return detailsPromise;
}

/** Adjacency in both directions, built once per dataset. */
export interface Adjacency {
  out: Map<string, string[]>;
  in: Map<string, string[]>;
}

export function buildAdjacency(links: GraphLink[]): Adjacency {
  const out = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const link of links) {
    if (!out.has(link.s)) out.set(link.s, []);
    if (!incoming.has(link.t)) incoming.set(link.t, []);
    out.get(link.s)!.push(link.t);
    incoming.get(link.t)!.push(link.s);
  }

  return { out, in: incoming };
}

/**
 * Everything reachable from `start`, following prerequisites backwards and
 * dependents forwards.
 *
 * This is what makes a large graph explorable: on its own the full graph shows
 * shape but no detail, and focusing a concept answers the question a teacher
 * actually has — what has to come before this, and what does it open up.
 *
 * The visited set is shared across both directions, so a node reachable each
 * way is walked once. Cycles terminate naturally.
 */
export function focusSubgraph(start: string, adjacency: Adjacency): Set<string> {
  const seen = new Set<string>([start]);

  for (const direction of [adjacency.in, adjacency.out]) {
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      for (const next of direction.get(queue[head]) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return seen;
}

/** Immediate neighbours only — used to highlight a hovered node cheaply. */
export function neighbours(id: string, adjacency: Adjacency): Set<string> {
  return new Set([id, ...(adjacency.in.get(id) ?? []), ...(adjacency.out.get(id) ?? [])]);
}

/**
 * Rank concepts against a query.
 *
 * A few thousand labels is small enough that a linear scan per keystroke is
 * imperceptible, so there is no index to keep in sync. Ordering prefers a prefix
 * match, then an earlier match position, then a shorter label — which puts the
 * exact concept someone typed at the top instead of a longer one containing it.
 */
export function searchNodes(nodes: SimNode[], query: string, limit = 24): SimNode[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const hits: { node: SimNode; rank: number }[] = [];
  for (const node of nodes) {
    const at = node.label.toLowerCase().indexOf(needle);
    if (at < 0) continue;
    hits.push({ node, rank: at * 1000 + node.label.length });
    if (hits.length > 400) break;
  }

  return hits
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((h) => h.node);
}
