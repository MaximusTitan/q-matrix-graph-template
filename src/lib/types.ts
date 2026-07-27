/**
 * TypeScript mirror of the contract emitted by
 * `q-matrix-agents/scripts/export_graph.py`.
 *
 * Keep `SCHEMA_VERSION` in step with the exporter's. The loader checks it and
 * refuses data it does not understand rather than rendering a wrong graph.
 */

export const SCHEMA_VERSION = 1;

/** Prerequisite scope: within a chapter, across chapters, across grades. */
export type Level = 1 | 2 | 3;

export const LEVEL_LABEL: Record<Level, string> = {
  1: "L1 · within chapter",
  2: "L2 · across chapters",
  3: "L3 · across grades",
};

export interface GraphNode {
  id: string;
  /** The concept name as written in the curriculum. */
  label: string;
  subject: string;
  /** Numeric grade, used to place the node on its layer. */
  grade: number;
  gradeLabel: string;
  /** Chapter folder name — the KB's real identifier for a chapter. */
  chapter: string;
  /** Chapter name with the `ChapterNN_` prefix stripped, for display. */
  chapterLabel: string;
  chapterOrder: number | null;
  /** Distinct skills taught under this concept in its chapter. */
  skillCount: number;
  /** Concepts this one depends on. */
  inDeg: number;
  /** Concepts that depend on this one. */
  outDeg: number;
}

/**
 * A directed prerequisite edge, `s` -> `t`, meaning "s must be learned before
 * t". Keys are terse because they repeat across thousands of links.
 */
export interface GraphLink {
  s: string;
  t: string;
  l: Level;
  /** True when the edge was lifted from a skill edge rather than authored. */
  d: boolean;
}

export interface GraphCore {
  schemaVersion: number;
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface PrereqDetail {
  from: string;
  level: Level;
  reason: string | null;
  derived: boolean;
}

export interface ConceptDetail {
  skills: string[];
  prereqs: PrereqDetail[];
}

export interface ConceptDetails {
  schemaVersion: number;
  details: Record<string, ConceptDetail>;
}

export interface GraphMeta {
  schemaVersion: number;
  generatedAt: string;
  board: string;
  subjects: string[];
  inventory: Record<string, Record<string, { chapters: number; concepts: number }>>;
  integrity: {
    chapterFiles: number;
    rows: number;
    nodes: number;
    edges: number;
    edgesByLevel: Record<string, number>;
    derivedEdges: number;
    crossSubjectEdges: number;
    crossGradeEdges: number;
    isolatedNodes: number;
    cycles: { cyclicComponents: number; nodesInCycles: number; largestCycle: number };
    unresolvedRefs: number;
    selfLoops: number;
    warnings: string[];
  };
}

/**
 * A node once the force simulation has touched it. react-force-graph mutates
 * the objects it is given, adding coordinates and honouring the `f*` pins.
 */
export interface SimNode extends GraphNode {
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
  /** Topological depth, filled in for the depth layout. */
  depth?: number;
}

/** A link after the simulation swaps the id strings for node references. */
export interface SimLink extends Omit<GraphLink, "s" | "t"> {
  s: string | SimNode;
  t: string | SimNode;
}

export const linkEndId = (end: string | SimNode): string =>
  typeof end === "string" ? end : end.id;
