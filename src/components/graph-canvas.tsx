"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import {
  CANVAS_BG,
  HIGHLIGHT,
  LEVEL_STYLE,
  LINK_BASE_RGB,
  NODE_REL_SIZE,
  SUBJECT_ORDER,
  nodeValue,
  subjectColor,
  type SizeMetric,
} from "@/lib/palette";
import {
  applyLayout,
  descendingLayerIndex,
  gradeLayers,
  layerGap,
  subjectForce,
  type LayoutMode,
} from "@/lib/layout";
import type { NavMode } from "@/lib/nav";
import { linkEndId, type GraphLink, type SimLink, type SimNode } from "@/lib/types";

// react-force-graph reaches for `window` at module scope, so it can only be
// pulled in on the client. Static export prerenders the page shell at build
// time; this keeps the 3D bundle out of that pass entirely.
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => null,
});

/** The slice of the imperative handle this component actually drives. */
interface ForceGraphHandle {
  scene: () => THREE.Scene;
  camera: () => THREE.PerspectiveCamera;
  cameraPosition: (
    position: { x?: number; y?: number; z?: number },
    lookAt?: { x: number; y: number; z: number },
    duration?: number,
  ) => void;
  d3Force: (name: string, force?: unknown) => unknown;
  d3ReheatSimulation: () => void;
  controls: () => OrbitLike;
}

/**
 * The parts of OrbitControls this component drives.
 *
 * OrbitControls rather than the library's default TrackballControls, because
 * trackball rotates freely about any axis — so an ordinary sideways drag rolls
 * the whole graph and the grade stack stops being vertical. Orbit keeps the
 * up-vector fixed: horizontal drag swings around the standing axis, vertical
 * drag changes elevation, and the layers never tilt off true.
 *
 * `controlType` is an init-only prop, so this is chosen once for every mode
 * rather than swapped per layout.
 */
interface OrbitLike {
  mouseButtons: { LEFT: number; MIDDLE: number; RIGHT: number };
  enableRotate: boolean;
  enablePan: boolean;
  enableZoom: boolean;
  enableDamping: boolean;
  dampingFactor: number;
  panSpeed: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
}

/**
 * How far the camera may swing above and below the horizon in a layered mode.
 *
 * Polar angle runs 0 (directly overhead) to π (directly underneath). Clamping
 * to roughly ±40° of the horizon keeps the stack readable side-on and stops
 * the view flipping over the top, which is the other way a layered layout
 * becomes unreadable.
 */
const LAYERED_POLAR = { min: Math.PI * 0.28, max: Math.PI * 0.72 };
const FREE_POLAR = { min: 0, max: Math.PI };

export interface GraphCanvasProps {
  nodes: SimNode[];
  links: GraphLink[];
  mode: LayoutMode;
  depth?: Map<string, number>;
  sizeMetric: SizeMetric;
  /** Ids currently in the focus subgraph, or null when nothing is focused. */
  focus: Set<string> | null;
  selectedId: string | null;
  navMode: NavMode;
  /** Idle rotation around the standing axis. */
  spin: boolean;
  onSelect: (node: SimNode | null) => void;
  /**
   * Hands the parent a way to re-frame the graph. Panning is unbounded — it is
   * entirely possible to slide the graph off screen with no visual cue about
   * which way to come back — so a reset has to be reachable from the toolbar.
   */
  onReady?: (api: { fitView: () => void }) => void;
}

/** Blend a hex colour toward the canvas background. */
function dim(hex: string, keep: number): string {
  const colour = new THREE.Color(hex);
  return colour.lerp(new THREE.Color(CANVAS_BG), 1 - keep).getStyle();
}

/**
 * A faint ring and a floating label for each layer.
 *
 * Without these the layers are implicit — you can see that nodes form bands
 * but not which grade a band is. The rings are ten line loops and ten sprites,
 * which is nothing next to the graph itself.
 */
interface LayerRing {
  /** Stack position from the bottom — the same index the nodes are pinned to. */
  index: number;
  /** The ordered value this layer represents: a grade, or a depth step. */
  value: number;
  label: string;
}

function buildLayerGuides(rings: LayerRing[], radius: number): THREE.Group {
  const group = new THREE.Group();
  group.name = "layer-guides";

  // Spacing follows the highest position a node can occupy, not the number of
  // rings. Those differ whenever the visible layers are non-contiguous, and
  // using the count would drift every ring away from the nodes it labels.
  const span = rings.reduce((max, r) => Math.max(max, r.index), 0) + 1;
  const gap = layerGap(span);

  // With many layers the labels collide into an unreadable stripe, so they
  // thin out as the stack deepens. Prerequisite depth reaches 54 steps on the
  // full corpus, against at most 10 grade layers.
  const labelEvery = span > 30 ? 10 : span > 14 ? 5 : 1;

  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
  const points = curve.getPoints(96).map((p) => new THREE.Vector3(p.x, 0, p.y));
  const ringGeometry = new THREE.BufferGeometry().setFromPoints(points);

  rings.forEach(({ index, value, label }) => {
    const y = index * gap;

    const ring = new THREE.LineLoop(
      ringGeometry,
      new THREE.LineBasicMaterial({ color: 0x4a4a42, transparent: true, opacity: 0.35 }),
    );
    ring.position.y = y;
    group.add(ring);

    // Thin by the layer's own value, not its position: the stack runs
    // downward, so keying off the index would label 54, 44, 34 … instead of
    // the round numbers a reader expects.
    if (value % labelEvery !== 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#8f8e83";
      ctx.font = "600 34px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 128, 32);
    }

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    sprite.scale.set(190, 48, 1);
    sprite.position.set(-(radius + 130), y, 0);
    group.add(sprite);
  });

  return group;
}

export default function GraphCanvas({
  nodes,
  links,
  mode,
  depth,
  sizeMetric,
  focus,
  selectedId,
  navMode,
  spin,
  onSelect,
  onReady,
}: GraphCanvasProps) {
  // The graph instance arrives asynchronously — ForceGraph3D is a dynamic
  // import, so a plain ref is still null during the mount effects. Holding it
  // in state lets the camera, force and guide effects wait for it rather than
  // silently doing nothing, which is exactly what a ref would have done.
  const [graph, setGraph] = useState<ForceGraphHandle | null>(null);
  const graphRef = useCallback((instance: ForceGraphHandle | null) => {
    if (instance) setGraph(instance);
  }, []);
  const guidesRef = useRef<THREE.Group | null>(null);
  const forcesReady = useRef(false);

  // The simulation stores position and velocity on the node objects it is
  // handed. Filtering must therefore hand back the *same* objects, or every
  // filter change would restart the layout from scratch.
  const graphData = useMemo(() => {
    applyLayout(nodes, mode, SUBJECT_ORDER, depth);
    return { nodes, links: links.map((l) => ({ ...l })) };
  }, [nodes, links, mode, depth]);

  const gradeNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const node of nodes) map.set(node.grade, node.gradeLabel);
    return map;
  }, [nodes]);

  // Forces are configured imperatively, after the component has mounted its
  // simulation. Charge is weakened from the default because a pinned Y axis
  // already prevents the collapse that a strong charge normally guards against.
  useEffect(() => {
    if (!graph) return;

    // Repulsion has to be strong enough to open each grade out into a broad
    // disc. Too weak and the subject anchor wins, compressing every layer into
    // a narrow column where nothing is distinguishable.
    const charge = graph.d3Force("charge") as { strength: (v: number) => void } | undefined;
    charge?.strength(-60);

    const link = graph.d3Force("link") as { distance: (v: number) => void } | undefined;
    link?.distance(30);

    if (mode === "free") {
      graph.d3Force("subject", null);
    } else {
      // The default centring force fights the per-subject anchors, so it is
      // removed in the layered modes rather than balanced against them.
      graph.d3Force("center", null);
      graph.d3Force("subject", subjectForce(SUBJECT_ORDER));
    }

    // Reheat only on a later mode change, never on first setup.
    //
    // d3ReheatSimulation flips the library's `engineRunning` flag, but the
    // simulation object it ticks is not created until the first graphData
    // flush. Reheating during mount therefore starts the render loop against
    // an undefined simulation and it dies with "Cannot read properties of
    // undefined (reading 'tick')". The library heats the simulation itself
    // when it first receives the data, so there is nothing to do here.
    if (forcesReady.current) graph.d3ReheatSimulation();
    else forcesReady.current = true;
  }, [graph, mode]);

  /**
   * One ring per layer, positioned with the *same* index function the nodes
   * are pinned by. Deriving ring positions independently is how rings drift
   * away from the bands they label as soon as the visible layers are not a
   * contiguous run.
   */
  const rings = useMemo<LayerRing[]>(() => {
    if (mode === "layered") {
      const grades = gradeLayers(nodes);
      const maxGrade = Math.max(...grades, 0);
      return grades.map((grade) => ({
        index: descendingLayerIndex(grade, maxGrade),
        value: grade,
        label: gradeNames.get(grade) ?? `Grade ${grade}`,
      }));
    }

    if (mode === "depth" && depth) {
      const maxDepth = Math.max(0, ...depth.values());
      return Array.from({ length: maxDepth + 1 }, (_, step) => ({
        index: descendingLayerIndex(step, maxDepth),
        value: step,
        label: step === 0 ? "Starting points" : `Step ${step}`,
      }));
    }

    return [];
  }, [mode, nodes, depth, gradeNames]);

  // Rings are sized to the layout that actually emerged rather than to a fixed
  // radius: how wide a layer spreads depends on the force tuning, the mode and
  // the current filters, so a hardcoded radius is wrong as soon as any of those
  // change.
  const rebuildGuides = useCallback(() => {
    if (!graph) return;

    const scene = graph.scene();
    if (guidesRef.current) {
      scene.remove(guidesRef.current);
      guidesRef.current = null;
    }
    if (mode === "free") return;

    const spread = nodes.reduce((max, n) => Math.max(max, Math.hypot(n.x ?? 0, n.z ?? 0)), 0);
    const radius = Math.max(spread * 1.06, 500);

    const guides = buildLayerGuides(rings, radius);

    scene.add(guides);
    guidesRef.current = guides;
  }, [graph, mode, rings, nodes]);

  useEffect(() => {
    rebuildGuides();
  }, [rebuildGuides]);

  const framed = useRef(false);

  /**
   * Frame the graph from the side, at a distance derived from its real extent.
   *
   * The library's own zoomToFit consistently pulls much further back than the
   * geometry needs here, leaving the graph a speck in a large empty canvas, so
   * the distance is solved directly: far enough that the bounding box clears
   * both the vertical and the horizontal field of view, whichever binds.
   */
  const frameGraph = useCallback(() => {
    const camera = graph?.camera();
    if (!graph || !camera || nodes.length === 0) return;

    let minY = Infinity;
    let maxY = -Infinity;
    let radius = 0;
    for (const node of nodes) {
      // Prefer the pinned target over the current position. Right after a mode
      // change the simulation has not yet moved anything, so reading `y` would
      // frame the layout being left rather than the one being entered.
      const y = node.fy ?? node.y ?? 0;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      radius = Math.max(radius, Math.hypot(node.x ?? 0, node.z ?? 0));
    }

    const centreY = (minY + maxY) / 2;
    const halfHeight = Math.max((maxY - minY) / 2, 1);
    const halfWidth = Math.max(radius, 1);

    const halfFovY = (camera.fov * Math.PI) / 360;
    const distanceForHeight = halfHeight / Math.tan(halfFovY);
    const distanceForWidth = halfWidth / Math.tan(Math.atan(Math.tan(halfFovY) * camera.aspect));

    const distance = Math.max(distanceForHeight, distanceForWidth) * 1.12 + halfWidth;
    graph.cameraPosition({ x: 0, y: centreY, z: distance }, { x: 0, y: centreY, z: 0 }, 700);
  }, [graph, nodes]);

  /**
   * Configure the camera controls for the current tool and layout.
   *
   * Select keeps left-drag on orbit; Move remaps it to a pan so the viewpoint
   * slides across a graph that does not itself move. Zoom stays on the wheel
   * in both, and the right button still pans in Select.
   *
   * The polar clamp is what keeps a layered stack upright: combined with
   * OrbitControls' fixed up-vector it means the graph can be spun and looked
   * at from a little above or below, but never rolled or turned over.
   */
  useEffect(() => {
    if (!graph) return;
    const controls = graph.controls();
    if (!controls?.mouseButtons) return;

    const moving = navMode === "move";
    controls.mouseButtons.LEFT = moving ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.enableRotate = !moving;
    controls.enablePan = true;
    controls.enableZoom = true;

    // Damping is what makes both the drag and the idle spin feel like motion
    // rather than teleporting. It requires update() every frame, which the
    // renderer already does.
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // Pan scales with distance from the target, and this graph is thousands of
    // units tall, so the camera sits far back and the stock speed throws it
    // off screen in one short drag.
    controls.panSpeed = 0.5;

    const polar = mode === "free" ? FREE_POLAR : LAYERED_POLAR;
    controls.minPolarAngle = polar.min;
    controls.maxPolarAngle = polar.max;
  }, [graph, navMode, mode]);

  /**
   * A slow idle spin around the standing axis, so the structure reads as
   * three-dimensional without anyone having to drag it.
   *
   * OrbitControls suspends this by itself while a drag is in progress. It is
   * suspended here too whenever a concept is open, because drifting the view
   * while someone is reading the panel — or tracing a focused chain — is
   * actively unhelpful, and it would fight the fly-to animation.
   */
  useEffect(() => {
    if (!graph) return;
    const controls = graph.controls();
    if (!controls) return;

    controls.autoRotate = spin && !selectedId;
    // OrbitControls turns 6°/s per unit of speed, so this is a revolution
    // every ~60s — enough to read the structure as solid, slow enough to
    // ignore while reading.
    controls.autoRotateSpeed = 1.0;
  }, [graph, spin, selectedId]);

  // Frame immediately on mount and on every mode change, using the pinned
  // targets — the layers are known the moment the layout is applied, so there
  // is no reason to make the user watch a badly-cropped view until the
  // simulation settles. It is framed again on engine stop, once the real
  // horizontal spread is known.
  useEffect(() => {
    framed.current = false;
    frameGraph();
  }, [mode, frameGraph]);

  const handleEngineStop = useCallback(() => {
    rebuildGuides();
    if (!framed.current) {
      framed.current = true;
      frameGraph();
    }
  }, [rebuildGuides, frameGraph]);

  useEffect(() => {
    if (graph) onReady?.({ fitView: frameGraph });
  }, [graph, frameGraph, onReady]);

  const nodeColor = useCallback(
    (node: object) => {
      const n = node as SimNode;
      const base = subjectColor(n.subject);
      if (n.id === selectedId) return HIGHLIGHT;
      if (!focus) return base;
      return focus.has(n.id) ? base : dim(base, 0.12);
    },
    [focus, selectedId],
  );

  const linkColor = useCallback(
    (link: object) => {
      const l = link as SimLink;
      const style = LEVEL_STYLE[l.l] ?? LEVEL_STYLE[1];
      if (!focus) return `rgba(${LINK_BASE_RGB}, ${style.opacity})`;

      const inFocus = focus.has(linkEndId(l.s)) && focus.has(linkEndId(l.t));
      if (!inFocus) return `rgba(${LINK_BASE_RGB}, 0.02)`;
      // Inside a focus subgraph the edge is the point, so it is drawn in the
      // colour of the concept it flows out of.
      const source = typeof l.s === "string" ? null : l.s;
      const hue = source ? subjectColor(source.subject) : HIGHLIGHT;
      return new THREE.Color(hue).getStyle().replace("rgb", "rgba").replace(")", ", 0.85)");
    },
    [focus],
  );

  // Particles animate along an edge in its direction of travel, which is how
  // the graph says "this comes before that". They are only allocated for the
  // focused subgraph — thousands of animated edges would be unreadable and slow.
  const linkParticles = useCallback(
    (link: object) => {
      const l = link as SimLink;
      if (!focus) return 0;
      return focus.has(linkEndId(l.s)) && focus.has(linkEndId(l.t)) ? 2 : 0;
    },
    [focus],
  );

  const nodeLabel = useCallback((node: object) => {
    const n = node as SimNode;
    const skills = n.skillCount === 1 ? "1 skill" : `${n.skillCount} skills`;
    return `
      <div class="pointer-events-none max-w-xs rounded-md border border-white/10 bg-[#12120f]/95 px-3 py-2 text-xs shadow-xl">
        <div class="font-medium text-[#f4f3ec]">${escapeHtml(n.label)}</div>
        <div class="mt-1 text-[#a3a297]">
          ${escapeHtml(n.subject)} · ${escapeHtml(n.gradeLabel)} · ${escapeHtml(n.chapterLabel)}
        </div>
        <div class="mt-0.5 text-[#a3a297]">${skills} · ${n.outDeg} unlocked · ${n.inDeg} prerequisites</div>
      </div>`;
  }, []);

  // Fly to whatever is selected, wherever the selection came from — a click on
  // the canvas, a search result, or a link followed inside the detail panel.
  // Driving this off `selectedId` rather than off the click handler means a
  // concept picked by name is just as findable as one picked by eye.
  useEffect(() => {
    if (!graph || !selectedId) return;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) return;

    // Approach along the current view direction so the camera keeps its
    // orientation and simply moves in. Scaling the node's position vector
    // instead would swing the camera to the far side of nodes near the origin,
    // which reads as the view jumping somewhere else entirely.
    const target = new THREE.Vector3(node.x ?? 0, node.y ?? 0, node.z ?? 0);
    const camera = graph.camera();
    const offset = new THREE.Vector3()
      .subVectors(camera.position, target)
      .normalize()
      .multiplyScalar(260);

    graph.cameraPosition(target.clone().add(offset), target, 900);
  }, [graph, selectedId, nodes]);

  const handleClick = useCallback((node: object) => onSelect(node as SimNode), [onSelect]);

  return (
    <div
      // The cursor is the mode indicator that is always where the user is
      // looking. `grab`/`grabbing` is the convention every canvas tool uses.
      className={`absolute inset-0 ${
        navMode === "move" ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <ForceGraph3D
        ref={graphRef as never}
        graphData={graphData}
        backgroundColor={CANVAS_BG}
        showNavInfo={false}
        // Orbit, not the default trackball — see OrbitLike. This is init-only,
        // so it cannot be varied per layout mode.
        controlType="orbit"
        linkSource="s"
        linkTarget="t"
        nodeRelSize={NODE_REL_SIZE}
        nodeVal={(node: object) => nodeValue(node as SimNode, sizeMetric)}
        nodeColor={nodeColor}
        nodeLabel={nodeLabel}
        // Spheres are drawn per node; trimming the segment count is the
        // cheapest win available at this node count.
        nodeResolution={6}
        nodeOpacity={0.95}
        // Zero width keeps links as GL lines. Any positive width switches the
        // renderer to cylinder meshes — thousands of them on a full graph —
        // which is the single most expensive mistake available here.
        linkWidth={0}
        linkOpacity={1}
        linkColor={linkColor}
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleWidth={2.2}
        linkDirectionalParticleSpeed={0.006}
        enableNodeDrag={false}
        // Move mode turns off picking entirely: no hover tooltips, no click
        // selection. Without this a pan that starts on a node would select it
        // on release, and tooltips would flicker under the drag.
        enablePointerInteraction={navMode === "select"}
        cooldownTime={9000}
        warmupTicks={12}
        onEngineStop={handleEngineStop}
        onNodeClick={handleClick}
        onBackgroundClick={() => onSelect(null)}
      />
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
