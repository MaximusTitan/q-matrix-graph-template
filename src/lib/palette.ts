/**
 * Visual encoding: which channel carries which variable.
 *
 *   subject      -> hue          (categorical / identity)
 *   grade        -> y position   (ordered, handled in layout.ts)
 *   size metric  -> node radius  (magnitude)
 *   prereq level -> link opacity + width (ordinal — deliberately NOT hue,
 *                   because hue is already spent on subject)
 *
 * The three subject hues are the first three slots of a validated categorical
 * palette, stepped for a dark surface. That prefix is specifically the one
 * that clears every gate under an all-pairs comparison — which is the right
 * test here, since all three subjects are on screen at once rather than
 * stacked in a fixed adjacency. Verified with the palette validator against
 * surface #12120f:
 *
 *   lightness band  PASS   chroma floor    PASS   contrast >= 3:1  PASS
 *   CVD separation  PASS   worst all-pairs dE 9.4 (deutan)
 *   normal vision   PASS   worst all-pairs dE 20.9
 *
 * Do not add a fourth hue. The next slot is yellow, which fails the all-pairs
 * floors against the orange already in use. Anything needing a fourth
 * distinction should use a different channel — a filter, opacity, or size.
 */

export const SUBJECT_COLORS: Record<string, string> = {
  Maths: "#3987e5",
  Science: "#d95926",
  "Environmental Science": "#199e70",
};

/** Fixed assignment order. Never cycled, never reassigned on filtering. */
export const SUBJECT_ORDER = ["Maths", "Science", "Environmental Science"];

export const SUBJECT_SHORT: Record<string, string> = {
  Maths: "Maths",
  Science: "Science",
  "Environmental Science": "EVS",
};

/** Fallback keeps an unrecognised subject visible rather than invisible. */
export const FALLBACK_COLOR = "#8b8a80";

export const subjectColor = (subject: string): string =>
  SUBJECT_COLORS[subject] ?? FALLBACK_COLOR;

export const CANVAS_BG = "#12120f";

/**
 * Link appearance by prerequisite level.
 *
 * L1 edges are the most numerous by far and are intra-chapter texture rather
 * than the story, so they sit close to the background. L3 edges are the
 * interesting ones — they are the cross-grade spans the layered layout exists
 * to reveal — so they get the most presence.
 *
 * All three are low in absolute terms because a full graph draws thousands of
 * lines at once: an opacity that looks reasonable on a single edge accumulates
 * into an opaque curtain across thousands, hiding the nodes the edges connect.
 */
export const LEVEL_STYLE: Record<number, { opacity: number; width: number }> = {
  1: { opacity: 0.05, width: 0.4 },
  2: { opacity: 0.13, width: 0.9 },
  3: { opacity: 0.2, width: 1.4 },
};

export const LINK_BASE_RGB = "205, 203, 190";
export const HIGHLIGHT = "#f4f3ec";

export type SizeMetric = "skills" | "downstream" | "degree";

export const SIZE_METRICS: { value: SizeMetric; label: string; hint: string }[] = [
  { value: "skills", label: "Skills taught", hint: "distinct skills under the concept (1–12)" },
  { value: "downstream", label: "Concepts unlocked", hint: "how many later concepts depend on it (0–23)" },
  { value: "degree", label: "Total connections", hint: "prerequisites plus dependents" },
];

export function sizeBase(
  node: { skillCount: number; inDeg: number; outDeg: number },
  metric: SizeMetric,
): number {
  switch (metric) {
    case "skills":
      return node.skillCount;
    case "downstream":
      return 1 + node.outDeg;
    case "degree":
      return 1 + node.inDeg + node.outDeg;
  }
}

/**
 * Node size, expressed as an explicit radius range rather than a raw exponent.
 *
 * A strict area-proportional encoding (radius ∝ √metric) is the textbook
 * choice, but it reads as nearly uniform here. The metrics are steep and
 * bottom-heavy — 47% of concepts teach exactly one skill — so the honest curve
 * leaves most of the graph at the floor with too little spread above it to see
 * at the zoom level the whole graph is viewed at.
 *
 * The exponent is therefore pushed above √ to exaggerate the difference, and
 * the result is clamped so the rare extremes cannot swell into blobs that
 * swallow their neighbours. Sizes are deliberately comparative here, not
 * measurable; the exact counts are in the tooltip and the detail panel.
 */
export const NODE_REL_SIZE = 4;
const MIN_RADIUS = 5;
const MAX_RADIUS = 26;
const SIZE_EXPONENT = 0.75;

export function nodeRadius(
  node: { skillCount: number; inDeg: number; outDeg: number },
  metric: SizeMetric,
): number {
  const base = Math.max(sizeBase(node, metric), 1);
  return Math.min(MIN_RADIUS * Math.pow(base, SIZE_EXPONENT), MAX_RADIUS);
}

/**
 * react-force-graph derives radius as `nodeRelSize * cbrt(nodeVal)`, so the
 * desired radius is cubed back through that relation. Going via an explicit
 * radius keeps the intent readable and the clamp meaningful.
 */
export const nodeValue = (
  node: { skillCount: number; inDeg: number; outDeg: number },
  metric: SizeMetric,
): number => Math.pow(nodeRadius(node, metric) / NODE_REL_SIZE, 3);
