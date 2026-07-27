/**
 * Spatial layout of the graph.
 *
 * An unconstrained 3D force layout of a large concept graph collapses into a
 * hairball: the force simulation optimises for even spacing, which throws away
 * the one thing this data has that a generic graph does not — a strong,
 * meaningful ordering by grade.
 *
 * The default layout therefore pins each node's Y to its grade and lets the
 * simulation act only in X/Z.
 *
 * Both layered modes run top-down: Grade 1 sits at the top and Grade 10 at the
 * bottom, just as depth starts at the entry concepts and descends. The payoff
 * is that a prerequisite is always drawn above the thing it unlocks, in every
 * mode, so links read consistently downward and switching modes never reverses
 * the direction the eye has learned to follow.
 */

import type { GraphLink, SimNode } from "./types";

export type LayoutMode = "layered" | "depth" | "free";

export const LAYOUT_MODES: {
  value: LayoutMode;
  label: string;
  hint: string;
  /** Sentence shown in the legend explaining what height means in this mode. */
  heightMeans: string;
}[] = [
  {
    value: "layered",
    label: "By grade",
    hint: "One layer per grade, Grade 1 at the top",
    heightMeans:
      "Height is grade, running downward from Grade 1. Earlier years sit above later " +
      "ones, so a prerequisite is always drawn above what it unlocks.",
  },
  {
    value: "depth",
    label: "By depth",
    hint: "Layered by longest prerequisite chain, independent of grade",
    heightMeans:
      "Depth runs downward: entry concepts sit at the top and each step descends into " +
      "more derived material, so links flow down. Step N means the longest chain of " +
      "prerequisites reaching a concept is N links. Independent of grade — one step can " +
      "hold concepts from several years. Concepts that depend on each other share a step.",
  },
  {
    value: "free",
    label: "Free 3D",
    hint: "Unconstrained force layout",
    heightMeans: "Height carries no meaning in this layout.",
  },
];

/**
 * The vertical gap has to beat the horizontal spread of a single layer,
 * otherwise adjacent grades interleave on screen and the layering — the whole
 * point of this layout — reads as noise. Keep LAYER_GAP comfortably larger
 * than SUBJECT_RADIUS if either is retuned.
 */
export const LAYER_GAP = 240;
const SUBJECT_RADIUS = 300;

/**
 * Soft cap on how far a node may drift from its subject anchor in X/Z.
 *
 * The 214 concepts with no prerequisite links have no link force acting on
 * them, so plain repulsion flings them arbitrarily far. Unchecked they wreck
 * the initial camera fit — the framing has to include them, which shrinks the
 * actual graph to a speck — so beyond this radius the anchor pull sharpens.
 *
 * The sharpening ramps rather than switching. A hard cutoff makes every
 * outbound node pile up exactly at the limit, turning each layer into a thin
 * crescent shell instead of a filled disc.
 */
const DRIFT_LIMIT = 520;

/**
 * Where each subject's cluster sits in the X/Z plane, spread evenly around a
 * circle. Without this the subjects interleave inside a layer and the colour
 * coding is the only thing separating them; with it, each grade reads as
 * distinct subject lobes.
 */
export function subjectAnchor(subject: string, order: string[]): { x: number; z: number } {
  const i = order.indexOf(subject);
  if (i < 0) return { x: 0, z: 0 };
  const angle = (i / Math.max(order.length, 1)) * Math.PI * 2;
  return { x: Math.cos(angle) * SUBJECT_RADIUS, z: Math.sin(angle) * SUBJECT_RADIUS };
}

/**
 * A d3-force that pulls nodes toward their subject anchor in X/Z only.
 *
 * Written against the minimal shape d3-force-3d expects: a callable that takes
 * alpha, plus an `initialize` the simulation calls with the node array.
 */
export function subjectForce(order: string[], strength = 0.022) {
  let nodes: SimNode[] = [];

  const force = (alpha: number) => {
    for (const node of nodes) {
      const anchor = subjectAnchor(node.subject, order);
      const dx = anchor.x - (node.x ?? 0);
      const dz = anchor.z - (node.z ?? 0);
      const overshoot = Math.max(0, Math.hypot(dx, dz) - DRIFT_LIMIT) / DRIFT_LIMIT;
      const k = strength * (1 + overshoot * 12) * alpha;

      const velocity = node as SimNode & { vx?: number; vz?: number };
      velocity.vx = (velocity.vx ?? 0) + dx * k;
      velocity.vz = (velocity.vz ?? 0) + dz * k;
    }
  };

  force.initialize = (n: SimNode[]) => {
    nodes = n;
  };

  return force;
}

/**
 * Strongly-connected components, via an iterative Tarjan.
 *
 * Recursion depth here is a function of the data, so the explicit stack is not
 * a style choice — a deep prerequisite chain would blow the call stack.
 */
function stronglyConnectedComponents(
  nodeIds: string[],
  outgoing: Map<string, string[]>,
): { componentOf: Map<string, number>; count: number; cyclic: number } {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const componentOf = new Map<string, number>();
  let counter = 0;
  let components = 0;
  let cyclic = 0;

  for (const root of nodeIds) {
    if (index.has(root)) continue;

    const work: [string, number][] = [[root, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const node = frame[0];

      if (frame[1] === 0) {
        index.set(node, counter);
        low.set(node, counter);
        counter++;
        stack.push(node);
        onStack.add(node);
      }

      const children = outgoing.get(node) ?? [];
      let recursed = false;
      while (frame[1] < children.length) {
        const child = children[frame[1]++];
        if (!index.has(child)) {
          work.push([child, 0]);
          recursed = true;
          break;
        }
        if (onStack.has(child)) low.set(node, Math.min(low.get(node)!, index.get(child)!));
      }
      if (recursed) continue;

      work.pop();
      if (low.get(node) === index.get(node)) {
        let size = 0;
        for (;;) {
          const member = stack.pop()!;
          onStack.delete(member);
          componentOf.set(member, components);
          size++;
          if (member === node) break;
        }
        if (size > 1) cyclic++;
        components++;
      }
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent)!, low.get(node)!));
      }
    }
  }

  return { componentOf, count: components, cyclic };
}

/**
 * Prerequisite depth for the "By depth" layout: the length of the longest
 * chain of prerequisites leading to each concept.
 *
 * Depth is computed on the *condensation* — every strongly-connected component
 * collapsed to a single vertex — rather than on the graph directly. The
 * condensation is always a DAG, so Kahn's algorithm resolves all of it and
 * every concept gets a real depth.
 *
 * Running Kahn's on the raw graph instead does not just mishandle the
 * concepts inside cycles: nothing downstream of a cycle ever reaches in-degree
 * zero either, so a large share of concepts can fail to resolve at all.
 * Approximating that many positions would make the layout mostly fiction.
 *
 * Concepts in the same cycle necessarily share a depth: their mutual
 * prerequisites make any ordering between them arbitrary, and the layout says
 * so by placing them on one layer instead of inventing a sequence.
 */
export function topologicalDepth(
  nodes: { id: string }[],
  links: GraphLink[],
): { depth: Map<string, number>; cyclicGroups: number; maxDepth: number } {
  const outgoing = new Map<string, string[]>();
  const present = new Set(nodes.map((n) => n.id));
  for (const id of present) outgoing.set(id, []);
  for (const link of links) {
    if (present.has(link.s) && present.has(link.t)) outgoing.get(link.s)!.push(link.t);
  }

  const nodeIds = nodes.map((n) => n.id);
  const { componentOf, count, cyclic } = stronglyConnectedComponents(nodeIds, outgoing);

  // Build the condensation, collapsing duplicate edges between components.
  const componentEdges: Set<number>[] = Array.from({ length: count }, () => new Set());
  const indegree = new Array<number>(count).fill(0);
  for (const link of links) {
    if (!present.has(link.s) || !present.has(link.t)) continue;
    const from = componentOf.get(link.s)!;
    const to = componentOf.get(link.t)!;
    if (from === to || componentEdges[from].has(to)) continue;
    componentEdges[from].add(to);
    indegree[to]++;
  }

  const componentDepth = new Array<number>(count).fill(0);
  const queue: number[] = [];
  for (let i = 0; i < count; i++) if (indegree[i] === 0) queue.push(i);

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    for (const next of componentEdges[current]) {
      componentDepth[next] = Math.max(componentDepth[next], componentDepth[current] + 1);
      if (--indegree[next] === 0) queue.push(next);
    }
  }

  const depth = new Map<string, number>();
  let maxDepth = 0;
  for (const id of nodeIds) {
    const d = componentDepth[componentOf.get(id)!];
    depth.set(id, d);
    if (d > maxDepth) maxDepth = d;
  }

  return { depth, cyclicGroups: cyclic, maxDepth };
}

/**
 * Apply a layout to the node objects in place.
 *
 * Mutation is deliberate: react-force-graph keeps simulation state on the very
 * objects it was handed, so reusing them across a mode change preserves the
 * settled X/Z positions instead of re-scattering the whole graph.
 */
/**
 * Vertical spacing for a given number of layers.
 *
 * Grade layers are always ten or fewer, but prerequisite depth can run to
 * thirty-plus steps. At a fixed gap that becomes a tower far taller than it is
 * wide, which frames badly and reads as a spike. Spacing is therefore chosen
 * to hold total height roughly constant, with a floor so layers stay distinct.
 */
export function layerGap(layerCount: number): number {
  if (layerCount <= 10) return LAYER_GAP;
  return Math.max((9 * LAYER_GAP) / (layerCount - 1), 50);
}

/**
 * Turn an ordered layer value into a stack position, counting from the bottom.
 *
 * Both layered modes descend, so the largest value — the last grade, or the
 * deepest prerequisite step — lands at position 0, the bottom of the stack.
 */
export function descendingLayerIndex(value: number, maxValue: number): number {
  return maxValue - value;
}

export function applyLayout(
  nodes: SimNode[],
  mode: LayoutMode,
  order: string[],
  depth?: Map<string, number>,
): void {
  const maxGrade = Math.max(...nodes.map((n) => n.grade));
  const maxDepth = depth ? Math.max(...depth.values(), 0) : 0;
  const gap = mode === "depth" && depth ? layerGap(maxDepth + 1) : LAYER_GAP;

  for (const node of nodes) {
    if (mode === "free") {
      delete node.fy;
      continue;
    }

    const layer =
      mode === "layered"
        ? descendingLayerIndex(node.grade, maxGrade)
        : descendingLayerIndex(depth?.get(node.id) ?? 0, maxDepth);
    node.fy = layer * gap;

    // Seed X/Z on first placement so the simulation starts from separated
    // subject lobes rather than converging into them from a single point.
    if (node.x === undefined || node.z === undefined) {
      const anchor = subjectAnchor(node.subject, order);
      node.x = anchor.x + (Math.random() - 0.5) * 140;
      node.z = anchor.z + (Math.random() - 0.5) * 140;
      node.y = node.fy;
    }
  }
}

/**
 * Distinct grades present, **descending** — the order the rings are drawn in,
 * bottom of the stack first, matching descendingLayerIndex. Returning these
 * ascending would label every ring with the wrong grade.
 */
export const gradeLayers = (nodes: SimNode[]): number[] =>
  Array.from(new Set(nodes.map((n) => n.grade))).sort((a, b) => b - a);
