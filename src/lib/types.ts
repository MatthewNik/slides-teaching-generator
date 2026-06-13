import type { TranscriptMode } from "./transcriptModes";

export type DeckStatus = "draft" | "processing" | "ready" | "published" | "error";

export type SlideGenerationStatus = "draft" | "generated" | "reviewed" | "error";

export type TtsStatus = "none" | "generating" | "ready" | "error";

export type TranscriptGenerationOptions = {
  includeSpeech: boolean;
};

/**
 * A single transcript variant for one slide in one transcript mode.
 * Each mode (summary, conceptual, ...) stores its own variant so switching
 * modes never overwrites another mode's content or audio.
 */
export type SlideTranscriptVariant = {
  transcriptMarkdown: string;
  transcriptLatex: string;
  speechText: string;
  keyTerms: string[];
  generationStatus: SlideGenerationStatus;
  audioPath?: string;
  ttsStatus?: TtsStatus;
  ttsError?: string;
};

export type SlideTranscript = {
  slideNumber: number;
  title: string;
  /**
   * Legacy top-level transcript fields. Kept for backward compatibility and
   * mirror the "summary" variant. New per-mode content lives in
   * `transcriptsByMode`.
   */
  transcriptMarkdown: string;
  transcriptLatex: string;
  speechText: string;
  keyTerms: string[];
  generationStatus: SlideGenerationStatus;
  audioPath?: string;
  ttsStatus?: TtsStatus;
  ttsError?: string;
  /** Per-mode transcript variants. May be absent on older decks. */
  transcriptsByMode?: Partial<Record<TranscriptMode, SlideTranscriptVariant>>;
};

export type DeckFolder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type DeckManifest = {
  id: string;
  title: string;
  status: DeckStatus;
  createdAt: string;
  updatedAt: string;
  originalFileName: string;
  pdfPath: string;
  pdfSize: number;
  pageCount?: number;
  folderId?: string | null;
  slides: SlideTranscript[];
  error?: string;
};

export type DeckSummary = Pick<
  DeckManifest,
  | "id"
  | "title"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "originalFileName"
  | "pdfSize"
  | "pageCount"
> & {
  slideCount: number;
  folderId?: string | null;
};

export type DeckIndex = {
  decks: DeckSummary[];
};

export type FolderIndex = {
  folders: DeckFolder[];
};

export type AppSettings = {
  geminiApiKey: string;
  piperExecutablePath: string;
  piperVoiceModelPath: string;
  voiceRate: number;
  viewerPdfPanePercent: number;
  viewerTranscriptBodyPercent: number;
  viewerShowSlideList: boolean;
  viewerShowTranscript: boolean;
  viewerAutoplayAudio: boolean;
  transcriptMathMode: "conservative";
  transcriptMode: TranscriptMode;
};
