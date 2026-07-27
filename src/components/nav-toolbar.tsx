"use client";

import { NAV_MODES, type NavMode } from "@/lib/nav";

/**
 * Tool switcher for the canvas.
 *
 * `spaceHeld` is shown as active but the underlying choice is not changed —
 * holding space is a temporary override, and the toolbar has to reflect what
 * the canvas is doing right now while still remembering what it returns to.
 */
export default function NavToolbar({
  mode,
  spaceHeld,
  onMode,
  onFitView,
  spin,
  onSpin,
}: {
  mode: NavMode;
  spaceHeld: boolean;
  onMode: (mode: NavMode) => void;
  onFitView: () => void;
  spin: boolean;
  onSpin: (spin: boolean) => void;
}) {
  const active: NavMode = spaceHeld ? "move" : mode;

  return (
    <div
      role="radiogroup"
      aria-label="Canvas tool"
      className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-[#16160f]/92 p-1 backdrop-blur-sm"
    >
      {NAV_MODES.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={active === option.value}
          aria-label={`${option.label} tool (${option.shortcut})`}
          title={`${option.label} — ${option.hint}  (${option.shortcut})`}
          onClick={() => onMode(option.value)}
          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
            active === option.value
              ? "bg-[#f4f3ec] text-[#12120f]"
              : "text-[#c5c4b8] hover:bg-white/10"
          }`}
        >
          {option.value === "select" ? <CursorIcon /> : <HandIcon />}
          <span>{option.label}</span>
          <kbd
            className={`rounded px-1 py-0.5 text-[10px] font-normal ${
              active === option.value ? "bg-black/10 text-[#12120f]" : "bg-white/10 text-[#8f8e83]"
            }`}
          >
            {option.shortcut}
          </kbd>
        </button>
      ))}

      <span aria-hidden className="mx-0.5 h-5 w-px bg-white/10" />

      <button
        type="button"
        onClick={onFitView}
        aria-label="Fit graph to view (R)"
        title="Fit graph to view  (R)"
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#c5c4b8] transition hover:bg-white/10"
      >
        <FitIcon />
        <span>Fit</span>
        <kbd className="rounded bg-white/10 px-1 py-0.5 text-[10px] font-normal text-[#8f8e83]">
          R
        </kbd>
      </button>

      <button
        type="button"
        onClick={() => onSpin(!spin)}
        aria-pressed={spin}
        aria-label="Toggle idle rotation"
        title={`${spin ? "Stop" : "Start"} the slow idle rotation`}
        className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
          spin ? "bg-white/12 text-[#f4f3ec]" : "text-[#c5c4b8] hover:bg-white/10"
        }`}
      >
        <SpinIcon />
        <span>Spin</span>
      </button>

      <span className="px-1.5 text-[10px] leading-tight text-[#6f6e64]">
        hold <kbd className="rounded bg-white/10 px-1 py-0.5 text-[#8f8e83]">space</kbd>
        <br />
        to pan
      </span>
    </div>
  );
}

function SpinIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <ellipse cx="8" cy="8" rx="6.2" ry="2.8" />
      <path d="M8 1.6v12.8" />
    </svg>
  );
}

function FitIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 5.5V2.5h3M14 5.5V2.5h-3M2 10.5v3h3M14 10.5v3h-3" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M3 1.6 12.4 8 8.2 8.9 6.4 13z" />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.2 7.4V3.6a1 1 0 0 1 2 0v3.3M7.2 6.9V2.9a1 1 0 0 1 2 0v4M9.2 7.2V4a1 1 0 0 1 2 0v3.9" />
      <path d="M5.2 7.4V6a1 1 0 0 0-2 0v3.4c0 2.6 1.7 4.6 4.3 4.6 2.6 0 3.7-1.8 3.7-4.4V7.9" />
    </svg>
  );
}
