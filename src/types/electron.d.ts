import type { ImportedSlideInput } from "@/lib/schemas";
import type {
  AppSettings,
  DeckFolder,
  DeckManifest,
  DeckSummary,
  SlideTranscript,
  TranscriptGenerationOptions,
} from "@/lib/types";
import type { TranscriptMode } from "@/lib/transcriptModes";

export type { ImportedSlideInput };

export type SlideUpdate = Pick<
  SlideTranscript,
  "title" | "transcriptMarkdown" | "transcriptLatex" | "speechText" | "keyTerms"
>;

export type DesktopApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SlideTutorDesktopApi = {
  listDecks: () => Promise<DesktopApiResult<DeckSummary[]>>;
  choosePdfAndCreateDeck: (title: string) => Promise<DesktopApiResult<DeckManifest | null>>;
  createDeckFromPdfPath: (
    sourcePath: string,
    title: string,
  ) => Promise<DesktopApiResult<DeckManifest>>;
  getPathForFile: (file: File) => string;
  getDeck: (deckId: string) => Promise<DesktopApiResult<DeckManifest>>;
  generateTranscripts: (
    deckId: string,
    mode: TranscriptMode,
    options: TranscriptGenerationOptions,
  ) => Promise<DesktopApiResult<DeckManifest>>;
  saveSlide: (
    deckId: string,
    slideNumber: number,
    update: SlideUpdate,
    mode: TranscriptMode,
  ) => Promise<DesktopApiResult<DeckManifest>>;
  publishDeck: (deckId: string) => Promise<DesktopApiResult<DeckManifest>>;
  reformatDeckMath: (deckId: string) => Promise<DesktopApiResult<DeckManifest>>;
  importExternalTranscripts: (
    deckId: string,
    slides: ImportedSlideInput[],
    mode: TranscriptMode,
    options: TranscriptGenerationOptions,
  ) => Promise<DesktopApiResult<DeckManifest>>;
  renameDeck: (deckId: string, title: string) => Promise<DesktopApiResult<DeckManifest>>;
  deleteDeck: (deckId: string) => Promise<DesktopApiResult<void>>;
  listFolders: () => Promise<DesktopApiResult<DeckFolder[]>>;
  createFolder: (name: string) => Promise<DesktopApiResult<DeckFolder>>;
  assignDeckFolder: (
    deckId: string,
    folderId: string | null,
  ) => Promise<DesktopApiResult<DeckManifest>>;
  getPdfBytes: (deckId: string) => Promise<DesktopApiResult<Uint8Array>>;
  generateSlideAudio: (
    deckId: string,
    slideNumber: number,
    mode: TranscriptMode,
  ) => Promise<DesktopApiResult<DeckManifest>>;
  generateDeckAudio: (
    deckId: string,
    mode: TranscriptMode,
  ) => Promise<DesktopApiResult<DeckManifest>>;
  getSlideAudioBytes: (
    deckId: string,
    slideNumber: number,
    mode: TranscriptMode,
  ) => Promise<DesktopApiResult<Uint8Array | null>>;
  getSettings: () => Promise<DesktopApiResult<AppSettings>>;
  saveSettings: (settings: AppSettings) => Promise<DesktopApiResult<AppSettings>>;
  choosePiperExecutable: () => Promise<DesktopApiResult<string | null>>;
  choosePiperVoiceModel: () => Promise<DesktopApiResult<string | null>>;
};

declare global {
  interface Window {
    slideTutor?: SlideTutorDesktopApi;
  }
}

export {};
