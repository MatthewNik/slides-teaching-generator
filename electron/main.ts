import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "child_process";
import { promises as fs, existsSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { GoogleGenAI } from "@google/genai";
import { normalizeMathFragments } from "../src/lib/mathNormalize";
import {
  geminiJsonSchema,
  geminiSlidesResponseSchema,
  importExternalTranscriptsSchema,
  slideUpdateSchema,
} from "../src/lib/schemas";
import { applyBundledPiperDefaults, resolvePiperInvocation } from "./piperResolve";
import type {
  AppSettings,
  DeckFolder,
  DeckIndex,
  DeckManifest,
  DeckSummary,
  FolderIndex,
  SlideTranscript,
  SlideTranscriptVariant,
} from "../src/lib/types";
import {
  TRANSCRIPT_MODE_PRESETS,
  coerceTranscriptMode,
  DEFAULT_TRANSCRIPT_MODE,
  type TranscriptMode,
} from "../src/lib/transcriptModes";
import type { DesktopApiResult, ImportedSlideInput, SlideUpdate } from "../src/types/electron";

const MODEL = "gemini-2.5-flash";

function dataRoot() {
  return (
    process.env.SLIDE_TUTOR_DATA_DIR ??
    path.join(app.getPath("userData"), "slide-tutor-data")
  );
}

function settingsPath() {
  return path.join(dataRoot(), "settings.json");
}

function indexPath() {
  return path.join(dataRoot(), "decks", "index.json");
}

function foldersPath() {
  return path.join(dataRoot(), "folders.json");
}

function deckDir(deckId: string) {
  assertDeckId(deckId);
  return path.join(dataRoot(), "decks", deckId);
}

function manifestPath(deckId: string) {
  return path.join(deckDir(deckId), "manifest.json");
}

function pdfPath(deckId: string) {
  return path.join(deckDir(deckId), "source.pdf");
}

function audioFileName(slideNumber: number, mode: TranscriptMode) {
  return mode === DEFAULT_TRANSCRIPT_MODE
    ? `slide-${slideNumber}.wav`
    : `slide-${slideNumber}-${mode}.wav`;
}

function audioPath(deckId: string, slideNumber: number, mode: TranscriptMode) {
  return path.join(deckDir(deckId), "audio", audioFileName(slideNumber, mode));
}

function variantFromSlide(slide: SlideTranscript): SlideTranscriptVariant {
  return {
    transcriptMarkdown: slide.transcriptMarkdown,
    transcriptLatex: slide.transcriptLatex,
    speechText: slide.speechText,
    keyTerms: slide.keyTerms ?? [],
    generationStatus: slide.generationStatus,
    audioPath: slide.audioPath,
    ttsStatus: slide.ttsStatus,
    ttsError: slide.ttsError,
  };
}

/** Mirror a variant onto the legacy top-level slide fields for backward compatibility. */
function mirrorTopLevel(
  slide: SlideTranscript,
  variant: SlideTranscriptVariant,
): SlideTranscript {
  return {
    ...slide,
    transcriptMarkdown: variant.transcriptMarkdown,
    transcriptLatex: variant.transcriptLatex,
    speechText: variant.speechText,
    keyTerms: variant.keyTerms,
    generationStatus: variant.generationStatus,
    audioPath: variant.audioPath,
    ttsStatus: variant.ttsStatus,
    ttsError: variant.ttsError,
  };
}

function modeEntries(
  byMode: Partial<Record<TranscriptMode, SlideTranscriptVariant>>,
): [TranscriptMode, SlideTranscriptVariant][] {
  return Object.entries(byMode).filter(
    (entry): entry is [TranscriptMode, SlideTranscriptVariant] => Boolean(entry[1]),
  );
}

function assertDeckId(deckId: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(deckId)) {
    throw new Error("Invalid deck id.");
  }
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function toSummary(deck: DeckManifest): DeckSummary {
  return {
    id: deck.id,
    title: deck.title,
    status: deck.status,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    originalFileName: deck.originalFileName,
    pdfSize: deck.pdfSize,
    pageCount: deck.pageCount,
    folderId: deck.folderId ?? null,
    slideCount: deck.slides.length,
  };
}

function defaultSettings(): AppSettings {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    piperExecutablePath: "",
    piperVoiceModelPath: "",
    voiceRate: 0.94,
    viewerPdfPanePercent: 54,
    viewerTranscriptBodyPercent: 72,
    viewerShowSlideList: true,
    viewerShowTranscript: true,
    viewerAutoplayAudio: false,
    transcriptMathMode: "conservative",
    transcriptMode: DEFAULT_TRANSCRIPT_MODE,
  };
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  const defaults = defaultSettings();
  const voiceRate = Number(settings.voiceRate ?? defaults.voiceRate);
  const viewerPdfPanePercent = Number(
    settings.viewerPdfPanePercent ?? defaults.viewerPdfPanePercent,
  );
  const viewerTranscriptBodyPercent = Number(
    settings.viewerTranscriptBodyPercent ?? defaults.viewerTranscriptBodyPercent,
  );
  const piperDefaults = applyBundledPiperDefaults({
    piperExecutablePath: String(
      settings.piperExecutablePath ?? defaults.piperExecutablePath,
    ).trim(),
    piperVoiceModelPath: String(
      settings.piperVoiceModelPath ?? defaults.piperVoiceModelPath,
    ).trim(),
  });

  return {
    geminiApiKey: String(settings.geminiApiKey ?? defaults.geminiApiKey).trim(),
    piperExecutablePath: piperDefaults.piperExecutablePath,
    piperVoiceModelPath: piperDefaults.piperVoiceModelPath,
    voiceRate: Math.min(2, Math.max(0.25, Number.isFinite(voiceRate) ? voiceRate : 0.94)),
    viewerPdfPanePercent: Math.min(
      75,
      Math.max(35, Number.isFinite(viewerPdfPanePercent) ? viewerPdfPanePercent : 54),
    ),
    viewerTranscriptBodyPercent: Math.min(
      90,
      Math.max(45, Number.isFinite(viewerTranscriptBodyPercent) ? viewerTranscriptBodyPercent : 72),
    ),
    viewerShowSlideList: Boolean(
      settings.viewerShowSlideList ?? defaults.viewerShowSlideList,
    ),
    viewerShowTranscript: Boolean(
      settings.viewerShowTranscript ?? defaults.viewerShowTranscript,
    ),
    viewerAutoplayAudio: Boolean(
      settings.viewerAutoplayAudio ?? defaults.viewerAutoplayAudio,
    ),
    transcriptMathMode: "conservative",
    transcriptMode: coerceTranscriptMode(settings.transcriptMode),
  };
}

async function listDecks() {
  const index = await readJson<DeckIndex>(indexPath(), { decks: [] });
  return index.decks;
}

async function listFolders() {
  const index = await readJson<FolderIndex>(foldersPath(), { folders: [] });
  return index.folders.sort((a, b) => a.name.localeCompare(b.name));
}

async function saveFolders(folders: DeckFolder[]) {
  await writeJson(foldersPath(), { folders } satisfies FolderIndex);
}

async function createFolder(name: string) {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Folder name is required.");
  }

  const folders = await listFolders();
  const existing = folders.find(
    (folder) => folder.name.toLowerCase() === normalizedName.toLowerCase(),
  );

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const folder: DeckFolder = {
    id: crypto.randomUUID(),
    name: normalizedName,
    createdAt: now,
    updatedAt: now,
  };

  await saveFolders([...folders, folder]);
  return folder;
}

async function saveDeckIndex(deck: DeckManifest) {
  const existing = await listDecks();
  const summary = toSummary(deck);
  const decks = [summary, ...existing.filter((item) => item.id !== deck.id)].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );

  await writeJson(indexPath(), { decks } satisfies DeckIndex);
}

async function readDeck(deckId: string) {
  return readJson<DeckManifest | null>(manifestPath(deckId), null);
}

/**
 * Bring a deck read from disk up to date:
 * - migrate legacy single-transcript slides into `transcriptsByMode.summary`
 * - attach any audio files found on disk to the matching mode variant
 * - keep the legacy top-level fields mirroring the summary variant
 */
async function reconcileDeck(deck: DeckManifest) {
  const audioDir = path.join(deckDir(deck.id), "audio");
  let files: string[] = [];

  try {
    files = await fs.readdir(audioDir);
  } catch {
    files = [];
  }

  const fileSet = new Set(files);
  let changed = false;

  const slides = deck.slides.map((original) => {
    let slide = original;

    // Migrate legacy decks: existing top-level transcript becomes the summary variant.
    if (!slide.transcriptsByMode || Object.keys(slide.transcriptsByMode).length === 0) {
      slide = {
        ...slide,
        transcriptsByMode: slide.transcriptMarkdown.trim()
          ? { [DEFAULT_TRANSCRIPT_MODE]: variantFromSlide(slide) }
          : {},
      };
      changed = true;
    }

    const byMode = { ...(slide.transcriptsByMode ?? {}) };
    let slideChanged = false;

    for (const [mode, variant] of modeEntries(byMode)) {
      if (variant.audioPath) continue;

      const expected = audioFileName(slide.slideNumber, mode);
      if (fileSet.has(expected)) {
        byMode[mode] = {
          ...variant,
          audioPath: path.posix.join("audio", expected),
          ttsStatus: "ready",
          ttsError: undefined,
        };
        slideChanged = true;
      }
    }

    if (slideChanged) {
      slide = { ...slide, transcriptsByMode: byMode };
      const summary = byMode[DEFAULT_TRANSCRIPT_MODE];
      if (summary) {
        slide = mirrorTopLevel(slide, summary);
      }
      changed = true;
    }

    return slide;
  });

  if (!changed) {
    return deck;
  }

  return saveDeck({ ...deck, slides });
}

async function requireDeck(deckId: string) {
  const deck = await readDeck(deckId);

  if (!deck) {
    throw new Error("Deck not found.");
  }

  return reconcileDeck(deck);
}

async function saveDeck(deck: DeckManifest) {
  const updatedDeck = {
    ...deck,
    updatedAt: new Date().toISOString(),
  } satisfies DeckManifest;

  await writeJson(manifestPath(deck.id), updatedDeck);
  await saveDeckIndex(updatedDeck);
  return updatedDeck;
}

async function getSettings(): Promise<AppSettings> {
  return normalizeSettings(await readJson<Partial<AppSettings>>(settingsPath(), {}));
}

async function saveSettings(settings: AppSettings) {
  const normalized = normalizeSettings(settings);

  await writeJson(settingsPath(), normalized);
  return normalized;
}

async function createDeckFromPdfPath(sourcePath: string, title: string) {
  if (!sourcePath.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF files can be imported.");
  }

  const stats = await fs.stat(sourcePath);

  if (stats.size > 50 * 1024 * 1024) {
    throw new Error("PDFs must be 50 MB or smaller.");
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await ensureDir(deckDir(id));
  await fs.copyFile(sourcePath, pdfPath(id));

  const deck: DeckManifest = {
    id,
    title: title.trim() || path.basename(sourcePath, path.extname(sourcePath)),
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    originalFileName: path.basename(sourcePath),
    pdfPath: "source.pdf",
    pdfSize: stats.size,
    folderId: null,
    slides: [],
  };

  return saveDeck(deck);
}

async function choosePdfAndCreateDeck(title: string, window: BrowserWindow) {
  const choice = await dialog.showOpenDialog(window, {
    title: "Choose slide PDF",
    properties: ["openFile"],
    filters: [{ name: "PDF files", extensions: ["pdf"] }],
  });

  if (choice.canceled || choice.filePaths.length === 0) {
    return null;
  }

  return createDeckFromPdfPath(choice.filePaths[0], title);
}

function buildGeminiPrompt(deck: DeckManifest, mode: TranscriptMode) {
  const preset = TRANSCRIPT_MODE_PRESETS[mode];

  return `
You are creating teaching notes for a PDF slide deck named "${deck.title}".

For every PDF page, create exactly one slide transcript object. The result must include every page in order.

Write for a student who is learning from the slide without a live instructor.

Transcript style: ${preset.label}.
${preset.promptInstructions}

Requirements:
- Explain the visible content on the slide, not generic background only.
- If formulas or symbols appear, render them in transcriptMarkdown using LaTeX delimiters such as \\( ... \\) or $$ ... $$.
- Never leave raw formula fragments undelimited in transcriptMarkdown. Prefer \\(V_o\\), \\(\\omega t\\), \\(\\sqrt{x}\\), and \\(K_p\\) instead of plain V_o, \\omega t, sqrt, or K_p.
- Example transcriptMarkdown sentence: "The gain is \\(K_p\\) and the phase depends on \\(\\omega t\\)."
- transcriptLatex should preserve the mathematical notation clearly.
- speechText must be plain narration for text-to-speech. Do not include raw LaTeX commands. Read equations naturally, e.g. "K sub p equals the limit as s approaches zero of G of s."
- Keep each slide transcript focused enough to be spoken in roughly 45 to 120 seconds.
- Include key terms, variables, and formulas in keyTerms.
- Set generationStatus to "generated".
`;
}

async function generateTranscripts(deckId: string, modeInput: TranscriptMode) {
  const mode = coerceTranscriptMode(modeInput);
  const settings = await getSettings();
  const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Add a Gemini API key in Settings before generating transcripts.");
  }

  const processingDeck = await saveDeck({
    ...(await requireDeck(deckId)),
    status: "processing",
    error: undefined,
  });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const uploadedFile = await ai.files.upload({
      file: pdfPath(processingDeck.id),
      config: {
        displayName: processingDeck.originalFileName,
        mimeType: "application/pdf",
      },
    });

    if (!uploadedFile.uri) {
      throw new Error("Gemini did not return a file URI for the uploaded PDF.");
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: uploadedFile.uri,
                mimeType: uploadedFile.mimeType ?? "application/pdf",
              },
            },
            { text: buildGeminiPrompt(processingDeck, mode) },
          ],
        },
      ],
      config: {
        temperature: 0.25,
        responseMimeType: "application/json",
        responseJsonSchema: geminiJsonSchema,
      },
    });

    if (!response.text) {
      throw new Error("Gemini returned no transcript text.");
    }

    const parsed = geminiSlidesResponseSchema.parse(JSON.parse(response.text));
    const parsedByNumber = new Map(parsed.slides.map((slide) => [slide.slideNumber, slide]));
    const existingByNumber = new Map(
      processingDeck.slides.map((slide) => [slide.slideNumber, slide]),
    );
    const slideNumbers = Array.from(
      new Set([...existingByNumber.keys(), ...parsedByNumber.keys()]),
    ).sort((a, b) => a - b);

    // Merge generated content into the selected mode only, preserving other modes.
    const slides: SlideTranscript[] = slideNumbers.map((slideNumber) => {
      const existing = existingByNumber.get(slideNumber);
      const incoming = parsedByNumber.get(slideNumber);

      if (!incoming) {
        return existing as SlideTranscript;
      }

      const normalizedMarkdown = normalizeMathFragments(incoming.transcriptMarkdown);
      const variant: SlideTranscriptVariant = {
        transcriptMarkdown: normalizedMarkdown,
        transcriptLatex: incoming.transcriptLatex || normalizedMarkdown,
        speechText: incoming.speechText,
        keyTerms: incoming.keyTerms ?? [],
        generationStatus: "generated",
        ttsStatus: "none",
        audioPath: undefined,
        ttsError: undefined,
      };

      const base: SlideTranscript = existing ?? {
        slideNumber,
        title: incoming.title,
        transcriptMarkdown: "",
        transcriptLatex: "",
        speechText: "",
        keyTerms: [],
        generationStatus: "draft",
        transcriptsByMode: {},
      };

      const byMode = { ...(base.transcriptsByMode ?? {}), [mode]: variant };
      let slide: SlideTranscript = {
        ...base,
        title: incoming.title || base.title,
        transcriptsByMode: byMode,
      };

      // Keep the legacy top-level fields populated (summary is canonical; for other
      // modes only fill top-level when it is still empty so back-compat consumers work).
      if (mode === DEFAULT_TRANSCRIPT_MODE || !slide.transcriptMarkdown.trim()) {
        slide = mirrorTopLevel(slide, variant);
        slide.title = incoming.title || base.title;
      }

      return slide;
    });

    return saveDeck({
      ...processingDeck,
      status: "ready",
      pageCount: parsed.slides.length || processingDeck.pageCount,
      slides,
      error: undefined,
    });
  } catch (error) {
    await saveDeck({
      ...processingDeck,
      status: "error",
      error: error instanceof Error ? error.message : "Gemini generation failed.",
    });
    throw error;
  }
}

async function saveSlide(
  deckId: string,
  slideNumber: number,
  update: SlideUpdate,
  modeInput: TranscriptMode,
) {
  const mode = coerceTranscriptMode(modeInput);
  const deck = await requireDeck(deckId);
  const parsed = slideUpdateSchema.parse(update);
  let found = false;

  const slides = deck.slides.map((slide) => {
    if (slide.slideNumber !== slideNumber) {
      return slide;
    }

    found = true;
    const normalizedMarkdown = normalizeMathFragments(parsed.transcriptMarkdown);
    const prevVariant =
      slide.transcriptsByMode?.[mode] ??
      (mode === DEFAULT_TRANSCRIPT_MODE ? variantFromSlide(slide) : undefined);
    const speechChanged = parsed.speechText.trim() !== (prevVariant?.speechText.trim() ?? "");

    const variant: SlideTranscriptVariant = {
      transcriptMarkdown: normalizedMarkdown,
      transcriptLatex: parsed.transcriptLatex,
      speechText: parsed.speechText,
      keyTerms: parsed.keyTerms,
      generationStatus: "reviewed",
      audioPath: speechChanged ? undefined : prevVariant?.audioPath,
      ttsStatus: speechChanged
        ? "none"
        : prevVariant?.audioPath
          ? "ready"
          : prevVariant?.ttsStatus ?? "none",
      ttsError: speechChanged ? undefined : prevVariant?.ttsError,
    };

    const byMode = { ...(slide.transcriptsByMode ?? {}), [mode]: variant };
    let next: SlideTranscript = {
      ...slide,
      title: parsed.title,
      transcriptsByMode: byMode,
    };

    if (mode === DEFAULT_TRANSCRIPT_MODE) {
      next = mirrorTopLevel(next, variant);
      next.title = parsed.title;
    }

    return next;
  });

  if (!found) {
    throw new Error("Slide not found.");
  }

  return saveDeck({
    ...deck,
    status: deck.status === "published" ? "published" : "ready",
    slides,
  });
}

async function reformatDeckMath(deckId: string) {
  const deck = await requireDeck(deckId);

  if (deck.slides.length === 0) {
    throw new Error("This deck has no slides to reformat.");
  }

  return saveDeck({
    ...deck,
    slides: deck.slides.map((slide) => {
      const byMode = slide.transcriptsByMode ?? {};
      const reformattedByMode: Partial<Record<TranscriptMode, SlideTranscriptVariant>> = {};

      for (const [mode, variant] of modeEntries(byMode)) {
        reformattedByMode[mode] = {
          ...variant,
          transcriptMarkdown: normalizeMathFragments(variant.transcriptMarkdown),
        };
      }

      return {
        ...slide,
        transcriptMarkdown: normalizeMathFragments(slide.transcriptMarkdown),
        transcriptsByMode: reformattedByMode,
      };
    }),
  });
}

async function importExternalTranscripts(deckId: string, slides: ImportedSlideInput[]) {
  const deck = await requireDeck(deckId);
  const parsed = importExternalTranscriptsSchema.parse({ slides });

  if (deck.slides.length > 0 && parsed.slides.length !== deck.slides.length) {
    throw new Error(
      `Imported ${parsed.slides.length} slides but this deck has ${deck.slides.length}. Check delimiters and paste the full response.`,
    );
  }

  const importByNumber = new Map(parsed.slides.map((slide) => [slide.slideNumber, slide]));

  let updatedSlides: SlideTranscript[];

  if (deck.slides.length > 0) {
    updatedSlides = deck.slides.map((existing) => {
      const imported = importByNumber.get(existing.slideNumber);
      if (!imported) {
        return existing;
      }

      const normalizedMarkdown = normalizeMathFragments(imported.transcriptMarkdown);
      const speechChanged = imported.speechText.trim() !== existing.speechText.trim();

      return {
        ...existing,
        title: imported.title,
        transcriptMarkdown: normalizedMarkdown,
        transcriptLatex: imported.transcriptLatex || normalizedMarkdown,
        speechText: imported.speechText,
        keyTerms: imported.keyTerms ?? existing.keyTerms,
        generationStatus: "reviewed" as const,
        audioPath: speechChanged ? undefined : existing.audioPath,
        ttsStatus: speechChanged
          ? ("none" as const)
          : existing.audioPath
            ? ("ready" as const)
            : ("none" as const),
        ttsError: speechChanged ? undefined : existing.ttsError,
      };
    });
  } else {
    updatedSlides = parsed.slides
      .map(
        (slide): SlideTranscript => ({
          slideNumber: slide.slideNumber,
          title: slide.title,
          transcriptMarkdown: normalizeMathFragments(slide.transcriptMarkdown),
          transcriptLatex: slide.transcriptLatex || slide.transcriptMarkdown,
          speechText: slide.speechText,
          keyTerms: slide.keyTerms ?? [],
          generationStatus: "reviewed",
          ttsStatus: "none",
          audioPath: undefined,
          ttsError: undefined,
        }),
      )
      .sort((a, b) => a.slideNumber - b.slideNumber);
  }

  // Imported content is treated as the canonical "summary" mode transcript.
  const slidesWithModes = updatedSlides.map((slide) => ({
    ...slide,
    transcriptsByMode: {
      ...(slide.transcriptsByMode ?? {}),
      [DEFAULT_TRANSCRIPT_MODE]: variantFromSlide(slide),
    },
  }));

  return saveDeck({
    ...deck,
    status: "ready",
    pageCount: deck.pageCount ?? slidesWithModes.length,
    slides: slidesWithModes,
    error: undefined,
  });
}

async function deleteDeck(deckId: string) {
  await requireDeck(deckId);
  await fs.rm(deckDir(deckId), { recursive: true, force: true });

  const decks = (await listDecks()).filter((deck) => deck.id !== deckId);
  await writeJson(indexPath(), { decks } satisfies DeckIndex);
}

async function renameDeck(deckId: string, title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new Error("Deck title is required.");
  }

  const deck = await requireDeck(deckId);
  return saveDeck({ ...deck, title: normalizedTitle });
}

async function assignDeckFolder(deckId: string, folderId: string | null) {
  const deck = await requireDeck(deckId);

  if (folderId) {
    const folders = await listFolders();
    const exists = folders.some((folder) => folder.id === folderId);

    if (!exists) {
      throw new Error("Folder not found.");
    }
  }

  return saveDeck({ ...deck, folderId });
}

async function publishDeck(deckId: string) {
  const deck = await requireDeck(deckId);

  if (deck.slides.length === 0) {
    throw new Error("Generate and review slide transcripts before publishing.");
  }

  return saveDeck({
    ...deck,
    status: "published",
    slides: deck.slides.map((slide) => ({
      ...slide,
      generationStatus:
        slide.generationStatus === "generated" ? "reviewed" : slide.generationStatus,
    })),
  });
}

async function runPiperForSlide(
  settings: AppSettings,
  speechText: string,
  outputPath: string,
) {
  const invocation = resolvePiperInvocation(
    settings.piperExecutablePath,
    settings.piperVoiceModelPath,
    outputPath,
    settings.voiceRate,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      reject(
        new Error(
          `${error.message}. Install Piper with "pip install piper-tts" or place piper.exe in the piper folder.`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `Piper exited with code ${code}.`));
      }
    });
    child.stdin.write(speechText);
    child.stdin.end();
  });
}

/** Update one mode variant on a single slide, mirroring summary to the top level. */
function patchSlideVariant(
  slide: SlideTranscript,
  mode: TranscriptMode,
  patch: Partial<SlideTranscriptVariant>,
): SlideTranscript {
  const prev = slide.transcriptsByMode?.[mode];
  if (!prev) {
    return slide;
  }

  const nextVariant: SlideTranscriptVariant = { ...prev, ...patch };
  const byMode = { ...(slide.transcriptsByMode ?? {}), [mode]: nextVariant };
  let next: SlideTranscript = { ...slide, transcriptsByMode: byMode };

  if (mode === DEFAULT_TRANSCRIPT_MODE) {
    next = mirrorTopLevel(next, nextVariant);
  }

  return next;
}

async function generateSlideAudio(
  deckId: string,
  slideNumber: number,
  modeInput: TranscriptMode,
) {
  const mode = coerceTranscriptMode(modeInput);
  const settings = await getSettings();
  const deck = await requireDeck(deckId);
  const slide = deck.slides.find((item) => item.slideNumber === slideNumber);

  if (!slide) {
    throw new Error("Slide not found.");
  }

  const variant = slide.transcriptsByMode?.[mode];

  if (!variant || !variant.speechText.trim()) {
    throw new Error(
      `This slide has no ${TRANSCRIPT_MODE_PRESETS[mode].label} narration text to synthesize.`,
    );
  }

  const outputPath = audioPath(deckId, slideNumber, mode);
  await ensureDir(path.dirname(outputPath));

  await saveDeck({
    ...deck,
    slides: deck.slides.map((item) =>
      item.slideNumber === slideNumber
        ? patchSlideVariant(item, mode, { ttsStatus: "generating", ttsError: undefined })
        : item,
    ),
  });

  try {
    await runPiperForSlide(settings, variant.speechText, outputPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Piper synthesis failed.";
    const failed = await requireDeck(deckId);
    await saveDeck({
      ...failed,
      slides: failed.slides.map((item) =>
        item.slideNumber === slideNumber
          ? patchSlideVariant(item, mode, { ttsStatus: "error", ttsError: message })
          : item,
      ),
    });
    throw error;
  }

  const refreshedDeck = await requireDeck(deckId);
  return saveDeck({
    ...refreshedDeck,
    slides: refreshedDeck.slides.map((item) =>
      item.slideNumber === slideNumber
        ? patchSlideVariant(item, mode, {
            audioPath: path.relative(deckDir(deckId), outputPath),
            ttsStatus: "ready",
            ttsError: undefined,
          })
        : item,
    ),
  });
}

async function generateDeckAudio(deckId: string, modeInput: TranscriptMode) {
  const mode = coerceTranscriptMode(modeInput);
  const deck = await requireDeck(deckId);

  if (deck.slides.length === 0) {
    throw new Error("This deck has no slides.");
  }

  let currentDeck = deck;

  for (const slide of deck.slides) {
    const variant = slide.transcriptsByMode?.[mode];
    if (!variant || !variant.speechText.trim()) {
      continue;
    }

    currentDeck = await generateSlideAudio(deckId, slide.slideNumber, mode);
  }

  return currentDeck;
}

async function getSlideAudioBytes(
  deckId: string,
  slideNumber: number,
  modeInput: TranscriptMode,
) {
  const mode = coerceTranscriptMode(modeInput);
  const deck = await requireDeck(deckId);
  const slide = deck.slides.find((item) => item.slideNumber === slideNumber);
  const audioRelativePath = slide?.transcriptsByMode?.[mode]?.audioPath;

  if (!audioRelativePath) {
    return null;
  }

  return fs.readFile(path.join(deckDir(deckId), audioRelativePath));
}

function api<T>(handler: () => Promise<T>): Promise<DesktopApiResult<T>> {
  return handler()
    .then((data) => ({ ok: true as const, data }))
    .catch((error) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : "Unexpected desktop error.",
    }));
}

function registerIpc(mainWindow: BrowserWindow) {
  ipcMain.handle("decks:list", () => api(() => listDecks()));
  ipcMain.handle("decks:choose-pdf-create", (_event, title: string) =>
    api(() => choosePdfAndCreateDeck(title, mainWindow)),
  );
  ipcMain.handle("decks:create-from-pdf-path", (_event, sourcePath: string, title: string) =>
    api(() => createDeckFromPdfPath(sourcePath, title)),
  );
  ipcMain.handle("decks:get", (_event, deckId: string) => api(() => requireDeck(deckId)));
  ipcMain.handle(
    "decks:generate-transcripts",
    (_event, deckId: string, mode: TranscriptMode) =>
      api(() => generateTranscripts(deckId, mode)),
  );
  ipcMain.handle(
    "decks:save-slide",
    (_event, deckId: string, slideNumber: number, update: SlideUpdate, mode: TranscriptMode) =>
      api(() => saveSlide(deckId, slideNumber, update, mode)),
  );
  ipcMain.handle("decks:publish", (_event, deckId: string) => api(() => publishDeck(deckId)));
  ipcMain.handle("decks:reformat-math", (_event, deckId: string) =>
    api(() => reformatDeckMath(deckId)),
  );
  ipcMain.handle(
    "decks:import-external-transcripts",
    (_event, deckId: string, slides: ImportedSlideInput[]) =>
      api(() => importExternalTranscripts(deckId, slides)),
  );
  ipcMain.handle("decks:rename", (_event, deckId: string, title: string) =>
    api(() => renameDeck(deckId, title)),
  );
  ipcMain.handle("decks:delete", (_event, deckId: string) => api(() => deleteDeck(deckId)));
  ipcMain.handle("folders:list", () => api(() => listFolders()));
  ipcMain.handle("folders:create", (_event, name: string) => api(() => createFolder(name)));
  ipcMain.handle("decks:assign-folder", (_event, deckId: string, folderId: string | null) =>
    api(() => assignDeckFolder(deckId, folderId)),
  );
  ipcMain.handle("decks:get-pdf-bytes", (_event, deckId: string) =>
    api(() => fs.readFile(pdfPath(deckId))),
  );
  ipcMain.handle(
    "tts:generate-slide-audio",
    (_event, deckId: string, slideNumber: number, mode: TranscriptMode) =>
      api(() => generateSlideAudio(deckId, slideNumber, mode)),
  );
  ipcMain.handle("tts:generate-deck-audio", (_event, deckId: string, mode: TranscriptMode) =>
    api(() => generateDeckAudio(deckId, mode)),
  );
  ipcMain.handle(
    "tts:get-slide-audio-bytes",
    (_event, deckId: string, slideNumber: number, mode: TranscriptMode) =>
      api(() => getSlideAudioBytes(deckId, slideNumber, mode)),
  );
  ipcMain.handle("settings:get", () => api(() => getSettings()));
  ipcMain.handle("settings:save", (_event, settings: AppSettings) =>
    api(() => saveSettings(settings)),
  );
  ipcMain.handle("settings:choose-piper-exe", () =>
    api(async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Choose Piper executable",
        properties: ["openFile"],
        filters: [{ name: "Executable", extensions: ["exe"] }],
      });
      return result.canceled ? null : result.filePaths[0];
    }),
  );
  ipcMain.handle("settings:choose-piper-voice", () =>
    api(async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Choose Piper voice model",
        properties: ["openFile"],
        filters: [{ name: "Piper voice model", extensions: ["onnx"] }],
      });
      return result.canceled ? null : result.filePaths[0];
    }),
  );
}

function resolveAppIcon() {
  // __dirname is <root>/dist-electron/electron in dev and inside the asar when packaged.
  const roots = [
    path.join(__dirname, "..", ".."),
    app.getAppPath(),
    process.cwd(),
    process.resourcesPath ?? "",
  ];
  const names = ["icon.ico", "icon.png"];

  for (const root of roots) {
    if (!root) continue;
    for (const name of names) {
      const candidate = path.join(root, "assets", name);
      if (existsSync(candidate)) return candidate;
    }
  }

  return undefined;
}

async function createWindow() {
  const appIcon = resolveAppIcon();

  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#f6f7f4",
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  registerIpc(mainWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadURL(
      pathToFileURL(path.join(app.getAppPath(), "out", "index.html")).toString(),
    );
  }
}

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.slidetutor.desktop");
  }

  await ensureDir(dataRoot());
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
