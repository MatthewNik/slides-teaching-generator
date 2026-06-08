"use client";

import { Check, Gauge } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const VOICE_SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

type VoiceSpeedMenuProps = {
  value: number;
  onChange: (rate: number) => void;
  compact?: boolean;
};

function formatSpeed(rate: number) {
  return Number.isInteger(rate) ? `${rate}x` : `${rate.toFixed(2).replace(/0$/, "")}x`;
}

function SpeedMenuList({
  value,
  onChange,
  onSelect,
}: {
  value: number;
  onChange: (rate: number) => void;
  onSelect: () => void;
}) {
  return (
    <>
      <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Playback speed
      </p>
      {VOICE_SPEED_OPTIONS.map((option) => {
        const selected = option === value;

        return (
          <button
            key={option}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => {
              onChange(option);
              onSelect();
            }}
            className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-panel-muted ${
              selected ? "bg-panel-muted font-semibold text-accent" : ""
            }`}
          >
            <span>{formatSpeed(option)}</span>
            {selected ? <Check size={14} aria-hidden /> : <span className="w-3.5" aria-hidden />}
          </button>
        );
      })}
    </>
  );
}

export function VoiceSpeedMenu({ value, onChange, compact = false }: VoiceSpeedMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, bottom: 0 });

  useEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      setMenuPosition({
        left: rect.left + rect.width / 2,
        bottom: window.innerHeight - rect.top + 8,
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, compact]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const menu = open ? (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Playback speed"
      className={
        compact
          ? "fixed z-[80] min-w-[9.5rem] -translate-x-1/2 overflow-hidden rounded-md border border-line bg-panel shadow-lg"
          : "absolute bottom-full left-0 z-20 mb-2 min-w-[9.5rem] overflow-hidden rounded-md border border-line bg-panel shadow-lg"
      }
      style={
        compact
          ? {
              left: menuPosition.left,
              bottom: menuPosition.bottom,
            }
          : undefined
      }
    >
      <SpeedMenuList value={value} onChange={onChange} onSelect={() => setOpen(false)} />
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative w-fit shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={
          compact
            ? "inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-md border border-line bg-panel px-2 text-xs font-semibold hover:bg-panel-muted"
            : "inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Playback speed ${formatSpeed(value)}`}
        title={`Playback speed ${formatSpeed(value)}`}
      >
        <Gauge size={17} />
        {compact ? <span>{formatSpeed(value)}</span> : formatSpeed(value)}
      </button>
      {menu && compact && typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : menu}
    </div>
  );
}
