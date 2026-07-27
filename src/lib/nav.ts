/**
 * Canvas navigation modes, in the Excalidraw sense: one tool that interacts
 * with the contents, one that moves the viewport over them.
 *
 * The distinction matters more in 3D than in 2D. The default trackball control
 * maps left-drag to orbit, so the reflex gesture spins the whole graph — which
 * is disorienting once you have found the region you care about, because it
 * destroys the mental map you just built. Move mode remaps left-drag to a
 * camera pan: the viewpoint slides, the graph stays exactly where it was.
 */

export type NavMode = "select" | "move";

export const NAV_MODES: {
  value: NavMode;
  label: string;
  hint: string;
  shortcut: string;
}[] = [
  {
    value: "select",
    label: "Select",
    hint: "Hover and click concepts · drag to orbit",
    shortcut: "V",
  },
  {
    value: "move",
    label: "Move",
    hint: "Drag to pan the view · the graph stays put",
    shortcut: "H",
  },
];

/**
 * Resolve a keyboard event to a mode, or null if it is not a mode shortcut.
 *
 * Digits mirror the letters because Excalidraw accepts both and the muscle
 * memory transfers. Any modifier means the key belongs to the browser or the
 * OS, not to us.
 */
export function navShortcut(event: KeyboardEvent): NavMode | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  switch (event.key.toLowerCase()) {
    case "v":
    case "1":
      return "select";
    case "h":
    case "2":
      return "move";
    default:
      return null;
  }
}

/**
 * Whether a keystroke is destined for a text field.
 *
 * Without this, typing "hello" into the search box would flip the canvas into
 * move mode on the "h".
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
  );
}
