"use client";

import { Upload } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";

type LocalLibraryDropZoneProps = {
  children: ReactNode;
  isElectron: boolean;
  isBusy: boolean;
  onDropPdf: (file: File) => void;
  onMessage: (text: string, options?: { isError?: boolean }) => void;
};

function isPdfFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

function hasPdfInTransfer(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;

  if (dataTransfer.types.includes("Files")) {
    return true;
  }

  return Array.from(dataTransfer.items).some(
    (item) => item.kind === "file" && (item.type === "application/pdf" || item.type === ""),
  );
}

export function LocalLibraryDropZone({
  children,
  isElectron,
  isBusy,
  onDropPdf,
  onMessage,
}: LocalLibraryDropZoneProps) {
  const dragDepthRef = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  function resetDragState() {
    dragDepthRef.current = 0;
    setIsDragOver(false);
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!isElectron || isBusy) return;
    if (!hasPdfInTransfer(event.dataTransfer)) return;

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!isElectron || isBusy) return;

    event.preventDefault();
    event.stopPropagation();

    if (hasPdfInTransfer(event.dataTransfer)) {
      event.dataTransfer.dropEffect = "copy";
      if (!isDragOver) setIsDragOver(true);
    } else {
      event.dataTransfer.dropEffect = "none";
    }
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!isElectron || isBusy) return;

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    resetDragState();

    if (!isElectron) {
      onMessage("Drag-and-drop import is only available in the desktop app.", { isError: true });
      return;
    }

    if (isBusy) {
      onMessage("Wait for the current task to finish before importing.", { isError: true });
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) {
      onMessage("No file was dropped.", { isError: true });
      return;
    }

    const pdfFile = files.find(isPdfFile);
    if (!pdfFile) {
      onMessage("Only PDF files can be dropped here.", { isError: true });
      return;
    }

    if (files.length > 1 && files.some((file) => file !== pdfFile && isPdfFile(file))) {
      onMessage("Imported the first PDF. Drop one file at a time for multiple imports.");
    }

    onDropPdf(pdfFile);
  }

  return (
    <section
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-lg border bg-panel transition-[border-color,box-shadow,background-color] duration-150 ${
        isDragOver
          ? "border-2 border-dashed border-accent bg-accent/5 shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent),0_0_24px_color-mix(in_srgb,var(--accent)_22%,transparent)]"
          : "border-line"
      }`}
    >
      {isDragOver ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-accent/5"
          aria-hidden
        >
          <div className="flex items-center gap-2 rounded-md border border-dashed border-accent bg-panel/95 px-4 py-2 text-sm font-semibold text-accent shadow-sm">
            <Upload size={16} />
            Drop PDF to import
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
