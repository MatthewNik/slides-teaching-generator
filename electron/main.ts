import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "child_process";
import { promises as fs } from "fs";
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
} from "../src/lib/types";
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

function audioPath(deckId: string, slideNumber: number) {
  return path.join(deckDir(deckId), "audio", `slide-${slideNumber}.wav`);
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

async function reconcileDeckAudio(deck: DeckManifest) {
  const audioDir = path.join(deckDir(deck.id), "audio");
  let files: string[] = [];

  try {
    files = await fs.readdir(audioDir);
  } catch {
    return deck;
  }

  let changed = false;

  const slides = deck.slides.map((slide) => {
    if (slide.audioPath) {
      return slide;
    }

    const expectedFile = `slide-${slide.slideNumber}.wav`;

    if (!files.includes(expectedFile)) {
      return slide;
    }

    changed = true;

    return {
      ...slide,
      audioPath: path.posix.join("audio", expectedFile),
      ttsStatus: "ready" as const,
      ttsError: undefined,
    };
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

  return reconcileDeckAudio(deck);
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

async function choosePdfAndCreateDeck(title: string, window: BrowserWindow) {
  const choice = await dialog.showOpenDialog(window, {
    title: "Choose slide PDF",
    properties: ["openFile"],
    filters: [{ name: "PDF files", extensions: ["pdf"] }],
  });

  if (choice.canceled || choice.filePaths.length === 0) {
    return null;
  }

  const sourcePath = choice.filePaths[0];
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

function buildGeminiPrompt(deck: DeckManifest) {
  return `
You are creating teaching notes for a PDF slide deck named "${deck.title}".

For every PDF page, create exactly one slide transcript object. The result must include every page in order.

Write for a student who is learning from the slide without a live instructor.

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

async function generateTranscripts(deckId: string) {
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
            { text: buildGeminiPrompt(processingDeck) },
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
    const slides = parsed.slides
      .map(
        (slide): SlideTranscript => ({
          ...slide,
          transcriptMarkdown: normalizeMathFragments(slide.transcriptMarkdown),
          keyTerms: slide.keyTerms ?? [],
          generationStatus: "generated",
          ttsStatus: "none",
        }),
      )
      .sort((a, b) => a.slideNumber - b.slideNumber);

    return saveDeck({
      ...processingDeck,
      status: "ready",
      pageCount: slides.length,
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

async function saveSlide(deckId: string, slideNumber: number, update: SlideUpdate) {
  const deck = await requireDeck(deckId);
  const parsed = slideUpdateSchema.parse(update);
  let found = false;

  const slides = deck.slides.map((slide) => {
    if (slide.slideNumber !== slideNumber) {
      return slide;
    }

    found = true;
    const speechChanged = parsed.speechText.trim() !== slide.speechText.trim();
    const normalizedMarkdown = normalizeMathFragments(parsed.transcriptMarkdown);

    return {
      ...slide,
      ...parsed,
      transcriptMarkdown: normalizedMarkdown,
      generationStatus: "reviewed" as const,
      audioPath: speechChanged ? undefined : slide.audioPath,
      ttsStatus: speechChanged ? ("none" as const) : slide.audioPath ? ("ready" as const) : ("none" as const),
      ttsError: speechChanged ? undefined : slide.ttsError,
    };
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
    slides: deck.slides.map((slide) => ({
      ...slide,
      transcriptMarkdown: normalizeMathFragments(slide.transcriptMarkdown),
    })),
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

  return saveDeck({
    ...deck,
    status: "ready",
    pageCount: deck.pageCount ?? updatedSlides.length,
    slides: updatedSlides,
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

async function generateSlideAudio(deckId: string, slideNumber: number) {
  const settings = await getSettings();
  const deck = await requireDeck(deckId);
  const slide = deck.slides.find((item) => item.slideNumber === slideNumber);

  if (!slide) {
    throw new Error("Slide not found.");
  }

  if (!slide.speechText.trim()) {
    throw new Error("This slide has no narration text to synthesize.");
  }

  const outputPath = audioPath(deckId, slideNumber);
  await ensureDir(path.dirname(outputPath));

  const slides = deck.slides.map((item) =>
    item.slideNumber === slideNumber
      ? { ...item, ttsStatus: "generating" as const, ttsError: undefined }
      : item,
  );
  await saveDeck({ ...deck, slides });

  try {
    await runPiperForSlide(settings, slide.speechText, outputPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Piper synthesis failed.";
    const failedSlides = (await requireDeck(deckId)).slides.map((item) =>
      item.slideNumber === slideNumber
        ? { ...item, ttsStatus: "error" as const, ttsError: message }
        : item,
    );
    await saveDeck({ ...(await requireDeck(deckId)), slides: failedSlides });
    throw error;
  }

  const refreshedDeck = await requireDeck(deckId);
  const readySlides = refreshedDeck.slides.map((item) =>
    item.slideNumber === slideNumber
      ? {
          ...item,
          audioPath: path.relative(deckDir(deckId), outputPath),
          ttsStatus: "ready" as const,
          ttsError: undefined,
        }
      : item,
  );

  return saveDeck({ ...refreshedDeck, slides: readySlides });
}

async function generateDeckAudio(deckId: string) {
  const deck = await requireDeck(deckId);

  if (deck.slides.length === 0) {
    throw new Error("This deck has no slides.");
  }

  let currentDeck = deck;

  for (const slide of deck.slides) {
    if (!slide.speechText.trim()) {
      continue;
    }

    currentDeck = await generateSlideAudio(deckId, slide.slideNumber);
  }

  return currentDeck;
}

async function getSlideAudioBytes(deckId: string, slideNumber: number) {
  const deck = await requireDeck(deckId);
  const slide = deck.slides.find((item) => item.slideNumber === slideNumber);

  if (!slide?.audioPath) {
    return null;
  }

  return fs.readFile(path.join(deckDir(deckId), slide.audioPath));
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
  ipcMain.handle("decks:get", (_event, deckId: string) => api(() => requireDeck(deckId)));
  ipcMain.handle("decks:generate-transcripts", (_event, deckId: string) =>
    api(() => generateTranscripts(deckId)),
  );
  ipcMain.handle(
    "decks:save-slide",
    (_event, deckId: string, slideNumber: number, update: SlideUpdate) =>
      api(() => saveSlide(deckId, slideNumber, update)),
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
  ipcMain.handle("tts:generate-slide-audio", (_event, deckId: string, slideNumber: number) =>
    api(() => generateSlideAudio(deckId, slideNumber)),
  );
  ipcMain.handle("tts:generate-deck-audio", (_event, deckId: string) =>
    api(() => generateDeckAudio(deckId)),
  );
  ipcMain.handle("tts:get-slide-audio-bytes", (_event, deckId: string, slideNumber: number) =>
    api(() => getSlideAudioBytes(deckId, slideNumber)),
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

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#f6f7f4",
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
