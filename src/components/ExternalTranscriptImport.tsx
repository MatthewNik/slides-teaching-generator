"use client";

import { buildExternalLlmPrompt } from "@/lib/externalLlmPrompt";
import { parseExternalTranscriptImport } from "@/lib/importTranscripts";
import type { DeckManifest } from "@/lib/types";
import type { ImportedSlideInput } from "@/lib/schemas";
import { ClipboardCopy, FileUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function pasteStorageKey(deckId: string) {
  return `slide-tutor:external-import:${deckId}`;
}

type ExternalTranscriptImportProps = {
  deck: DeckManifest;
  isBusy: boolean;
  onImport: (slides: ImportedSlideInput[]) => Promise<void>;
  onMessage: (message: string) => void;
};

export function ExternalTranscriptImport({
  deck,
  isBusy,
  onImport,
  onMessage,
}: ExternalTranscriptImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pasteText, setPasteText] = useState(() => {
    try {
      return sessionStorage.getItem(pasteStorageKey(deck.id)) ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(pasteStorageKey(deck.id), pasteText);
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [deck.id, pasteText]);

  const expectedSlideCount = deck.slides.length || deck.pageCount || 0;

  const parseResult = useMemo(
    () => parseExternalTranscriptImport(pasteText, expectedSlideCount || undefined),
    [pasteText, expectedSlideCount],
  );

  const canImport = parseResult.errors.length === 0 && parseResult.slides.length > 0;

  async function copyPrompt() {
    const prompt = buildExternalLlmPrompt(deck);

    try {
      await navigator.clipboard.writeText(prompt);
      onMessage("External LLM prompt copied. Attach the PDF in ChatGPT, then paste the response here.");
    } catch {
      onMessage("Could not copy the prompt to the clipboard.");
    }
  }

  async function handleImport() {
    if (!canImport) return;

    const existingCount = deck.slides.length;
    const importedCount = parseResult.slides.length;
    const replaceMessage =
      existingCount > 0
        ? `This will update markdown and speech for ${importedCount} slides. Existing slides and PDF are kept. Continue?`
        : `Import ${importedCount} slides into this deck?`;

    if (!window.confirm(replaceMessage)) {
      return;
    }

    await onImport(
      parseResult.slides.map((slide) => ({
        slideNumber: slide.slideNumber,
        title: slide.title,
        transcriptMarkdown: slide.transcriptMarkdown,
        transcriptLatex: slide.transcriptLatex,
        speechText: slide.speechText,
        keyTerms: slide.keyTerms,
      })),
    );
  }

  return (
    <div className="rounded-lg border border-line bg-panel">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold hover:bg-panel-muted"
      >
        <span className="inline-flex items-center gap-2">
          <FileUp size={17} />
          Import from external LLM
        </span>
        <span className="text-zinc-600">{isOpen ? "Hide" : "Show"}</span>
      </button>

      {isOpen ? (
        <div className="grid gap-3 border-t border-line p-4">
          <p className="text-sm text-zinc-600">
            Copy the prompt into ChatGPT with your PDF attached, then paste the full response below.
            Each slide must include <code className="font-mono">---MARKDOWN---</code> and{" "}
            <code className="font-mono">---SPEECH---</code>, separated by commas or slide headers
            between slides.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyPrompt()}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
            >
              <ClipboardCopy size={17} />
              Copy prompt
            </button>
          </div>

          <label className="grid gap-2 text-sm font-medium">
            Paste ChatGPT response
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              rows={12}
              placeholder="Paste the full response from ChatGPT here..."
              className="min-h-[12rem] resize-y rounded-md border border-line bg-white px-3 py-2 font-mono text-sm cursor-text caret-accent outline-none focus:border-accent"
            />
          </label>

          {parseResult.slides.length > 0 && parseResult.errors.length === 0 ? (
            <div className="rounded-md border border-line bg-panel-muted p-3 text-sm">
              <p className="font-semibold">
                Ready to import {parseResult.slides.length} slide
                {parseResult.slides.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-2 grid gap-1 text-zinc-700">
                {parseResult.slides.slice(0, 6).map((slide) => (
                  <li key={slide.slideNumber}>
                    Slide {slide.slideNumber}: {slide.title}
                  </li>
                ))}
                {parseResult.slides.length > 6 ? (
                  <li>...and {parseResult.slides.length - 6} more</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {parseResult.warnings.map((warning) => (
            <p key={warning} className="text-sm text-warn">
              {warning}
            </p>
          ))}

          {parseResult.errors.map((error) => (
            <p key={error} className="text-sm text-danger">
              {error}
            </p>
          ))}

          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={!canImport || isBusy}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            <FileUp size={17} />
            Import slides
          </button>
        </div>
      ) : null}
    </div>
  );
}
