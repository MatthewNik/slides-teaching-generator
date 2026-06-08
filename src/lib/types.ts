export type DeckStatus = "draft" | "processing" | "ready" | "published" | "error";

export type SlideGenerationStatus = "draft" | "generated" | "reviewed" | "error";

export type SlideTranscript = {
  slideNumber: number;
  title: string;
  transcriptMarkdown: string;
  transcriptLatex: string;
  speechText: string;
  keyTerms: string[];
  generationStatus: SlideGenerationStatus;
  audioPath?: string;
  ttsStatus?: "none" | "generating" | "ready" | "error";
  ttsError?: string;
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
};
