"use client";

import { Check, ChevronDown, Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  TRANSCRIPT_MODES,
  TRANSCRIPT_MODE_PRESETS,
  type TranscriptMode,
} from "@/lib/transcriptModes";

type TranscriptModeMenuProps = {
  value: TranscriptMode;
  onChange: (mode: TranscriptMode) => void;
  compact?: boolean;
  buttonClassName?: string;
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
};

export function TranscriptModeMenu({
  value,
  onChange,
  compact = false,
  buttonClassName,
  ariaLabel = "Transcript generation mode",
}: TranscriptModeMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, TRANSCRIPT_MODES.indexOf(value)),
  );

  const selectedPreset = TRANSCRIPT_MODE_PRESETS[value];

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => listRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function openMenu() {
    setActiveIndex(Math.max(0, TRANSCRIPT_MODES.indexOf(value)));
    setOpen(true);
  }

  function closeAndFocusButton() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function commit(index: number) {
    const mode = TRANSCRIPT_MODES[index];
    if (mode) onChange(mode);
    closeAndFocusButton();
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => Math.min(TRANSCRIPT_MODES.length - 1, current + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => Math.max(0, current - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(TRANSCRIPT_MODES.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        closeAndFocusButton();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${selectedPreset.label}`}
        className={
          buttonClassName ??
          (compact
            ? "inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
            : "inline-flex h-11 w-full items-center justify-between gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium hover:border-accent")
        }
      >
        <span className="truncate">{selectedPreset.label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          ref={listRef}
          role="listbox"
          id={listboxId}
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={`${listboxId}-${activeIndex}`}
          onKeyDown={handleListKeyDown}
          className="absolute left-0 top-full z-30 mt-2 w-full min-w-[16rem] overflow-visible rounded-md border border-line bg-panel shadow-lg outline-none"
        >
          {TRANSCRIPT_MODES.map((mode, index) => {
            const preset = TRANSCRIPT_MODE_PRESETS[mode];
            const selected = mode === value;
            const active = index === activeIndex;

            return (
              <div
                key={mode}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={selected}
                title={preset.description}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={`relative flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm hover:z-10 ${
                  active ? "z-10 bg-panel-muted" : ""
                } ${selected ? "font-semibold text-accent" : "text-foreground"}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Check
                    size={15}
                    className={`shrink-0 ${selected ? "opacity-100 text-accent" : "opacity-0"}`}
                    aria-hidden
                  />
                  <span className="truncate">{preset.label}</span>
                </span>

                <span
                  className="group/info relative inline-flex shrink-0"
                  title={preset.description}
                  aria-label={preset.description}
                  role="note"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-400 text-zinc-500">
                    <Info size={12} aria-hidden />
                  </span>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 w-48 -translate-y-1/2 rounded-md border border-line bg-foreground px-2 py-1 text-xs font-normal leading-snug text-background opacity-0 shadow-lg transition-opacity duration-150 group-hover/info:opacity-100 group-focus-within/info:opacity-100"
                  >
                    {preset.description}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
