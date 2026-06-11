"use client";

import type { DeckFolder } from "@/lib/types";
import { Check, ChevronDown, Folder } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_PADDING = 8;
const MENU_GAP = 8;

type FolderSelectMenuProps = {
  value: string | null;
  folders: DeckFolder[];
  onChange: (folderId: string | null) => void;
  compact?: boolean;
  className?: string;
};

type MenuPosition = {
  left: number;
  top?: number;
  bottom?: number;
  minWidth: number;
  maxHeight: number;
  openUpward: boolean;
};

function folderLabel(value: string | null, folders: DeckFolder[]) {
  if (!value) return "Unfiled";
  return folders.find((folder) => folder.id === value)?.name ?? "Unfiled";
}

function computeMenuPosition(button: HTMLButtonElement, optionCount: number): MenuPosition {
  const rect = button.getBoundingClientRect();
  const estimatedMenuHeight = 40 + optionCount * 40;
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
  const spaceAbove = rect.top - VIEWPORT_PADDING;
  const openUpward = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;

  const maxHeight = openUpward
    ? Math.max(120, spaceAbove - MENU_GAP)
    : Math.max(120, spaceBelow - MENU_GAP);

  const top = openUpward ? undefined : rect.bottom + MENU_GAP;
  const bottom = openUpward ? window.innerHeight - rect.top + MENU_GAP : undefined;

  return {
    left: rect.left,
    top,
    bottom,
    minWidth: rect.width,
    maxHeight,
    openUpward,
  };
}

function FolderMenuList({
  value,
  options,
  onChange,
  onSelect,
}: {
  value: string | null;
  options: Array<{ id: string | null; label: string }>;
  onChange: (folderId: string | null) => void;
  onSelect: () => void;
}) {
  return (
    <>
      <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Folder
      </p>
      {options.map((option) => {
        const selected = option.id === value;

        return (
          <button
            key={option.id ?? "unfiled"}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => {
              onChange(option.id);
              onSelect();
            }}
            className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-panel-muted ${
              selected ? "bg-panel-muted font-semibold text-accent" : ""
            }`}
          >
            <span className="truncate">{option.label}</span>
            {selected ? <Check size={14} aria-hidden /> : <span className="w-3.5" aria-hidden />}
          </button>
        );
      })}
    </>
  );
}

export function FolderSelectMenu({
  value,
  folders,
  onChange,
  compact = false,
  className = "",
}: FolderSelectMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    left: 0,
    minWidth: 0,
    maxHeight: 320,
    openUpward: false,
  });

  const options: Array<{ id: string | null; label: string }> = [
    { id: null, label: "Unfiled" },
    ...folders.map((folder) => ({ id: folder.id, label: folder.name })),
  ];

  useEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const button = buttonRef.current;
      if (!button) return;
      setMenuPosition(computeMenuPosition(button, options.length));
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, options.length]);

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
      aria-label="Folder"
      className="fixed z-[80] overflow-y-auto overflow-x-hidden rounded-md border border-line bg-panel shadow-lg"
      style={{
        left: menuPosition.left,
        top: menuPosition.top,
        bottom: menuPosition.bottom,
        minWidth: menuPosition.minWidth,
        maxHeight: menuPosition.maxHeight,
      }}
    >
      <FolderMenuList
        value={value}
        options={options}
        onChange={onChange}
        onSelect={() => setOpen(false)}
      />
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={
          compact
            ? "inline-flex h-9 w-full min-w-[8rem] items-center justify-between gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
            : "inline-flex h-10 w-full min-w-[9rem] items-center justify-between gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Folder: ${folderLabel(value, folders)}`}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Folder size={16} className="shrink-0 text-zinc-500" />
          <span className="truncate">{folderLabel(value, folders)}</span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-zinc-500" />
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}
