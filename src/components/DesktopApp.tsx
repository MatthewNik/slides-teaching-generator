"use client";

import {
  BookOpen,
  CirclePlay,
  FileAudio,
  FileText,
  Folder,
  Library,
  PanelLeft,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings,
  Square,
  Trash2,
  Upload,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type {
  AppSettings,
  DeckFolder,
  DeckManifest,
  DeckSummary,
  SlideTranscript,
  SlideTranscriptVariant,
} from "@/lib/types";
import {
  DEFAULT_TRANSCRIPT_MODE,
  TRANSCRIPT_MODE_PRESETS,
  type TranscriptMode,
} from "@/lib/transcriptModes";
import type { ImportedSlideInput } from "@/lib/schemas";
import type { SlideUpdate } from "@/types/electron";
import { ExternalTranscriptImport } from "./ExternalTranscriptImport";
import { FolderSelectMenu } from "./FolderSelectMenu";
import { LocalLibraryDropZone } from "./LocalLibraryDropZone";
import { useAutoDismissMessage } from "@/hooks/useAutoDismissMessage";
import { MarkdownTranscript } from "./MarkdownTranscript";
import { PdfSlide } from "./PdfSlide";
import { SpeechControls, type SpeechControlsHandle } from "./SpeechControls";
import { TranscriptModeMenu } from "./TranscriptModeMenu";
import { VoiceSpeedMenu } from "./VoiceSpeedMenu";

type ViewMode = "library" | "editor" | "viewer" | "settings";

const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: "",
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

function emptyVariant(): SlideTranscriptVariant {
  return {
    transcriptMarkdown: "",
    transcriptLatex: "",
    speechText: "",
    keyTerms: [],
    generationStatus: "draft",
  };
}

function resolveVariant(
  slide: SlideTranscript,
  mode: TranscriptMode,
): SlideTranscriptVariant | null {
  const variant = slide.transcriptsByMode?.[mode];
  if (variant) return variant;

  // Backward compatibility: treat a legacy top-level transcript as the summary mode.
  if (mode === DEFAULT_TRANSCRIPT_MODE && slide.transcriptMarkdown.trim()) {
    return {
      transcriptMarkdown: slide.transcriptMarkdown,
      transcriptLatex: slide.transcriptLatex,
      speechText: slide.speechText,
      keyTerms: slide.keyTerms,
      generationStatus: slide.generationStatus,
      audioPath: slide.audioPath,
      ttsStatus: slide.ttsStatus,
      ttsError: slide.ttsError,
    };
  }

  return null;
}

function desktopApi() {
  if (!window.slideTutor) {
    throw new Error("Slide Tutor desktop API is unavailable. Open this app in Electron.");
  }

  return window.slideTutor;
}

function toObjectUrl(bytes: Uint8Array, type: string) {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer], { type });
  return URL.createObjectURL(blob);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function statusText(deck: DeckSummary | DeckManifest) {
  if (deck.status === "processing") return "Generating";
  if (deck.status === "published") return "Published";
  if (deck.status === "ready") return "Ready";
  if (deck.status === "error") return "Needs attention";
  return "Draft";
}

function folderName(folders: DeckFolder[], folderId?: string | null) {
  if (!folderId) return "Unfiled";
  return folders.find((folder) => folder.id === folderId)?.name ?? "Unfiled";
}

function effectiveSlideCount(deck: DeckManifest | null, pdfPageCount: number) {
  if (!deck) return 0;
  return Math.max(deck.slides.length, pdfPageCount, deck.pageCount ?? 0);
}

function PdfFromDeck({
  deckId,
  pageNumber,
  onPageCount,
  scaleMultiplier = 1,
  fitMode = "width",
  className = "",
  onClick,
}: {
  deckId: string;
  pageNumber: number;
  onPageCount?: (pageCount: number) => void;
  scaleMultiplier?: number;
  fitMode?: "width" | "contain";
  className?: string;
  onClick?: () => void;
}) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;

    async function loadPdf() {
      setError("");
      const result = await desktopApi().getPdfBytes(deckId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      objectUrl = toObjectUrl(result.data, "application/pdf");

      if (!cancelled) {
        setPdfUrl(objectUrl);
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [deckId]);

  if (error) {
    return (
      <div className="rounded-lg border border-line bg-panel p-5 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="min-h-[320px] rounded-lg border border-line bg-panel-muted p-5 text-sm text-zinc-600">
        Loading PDF...
      </div>
    );
  }

  return (
    <PdfSlide
      pdfUrl={pdfUrl}
      pageNumber={pageNumber}
      onPageCount={onPageCount}
      scaleMultiplier={scaleMultiplier}
      fitMode={fitMode}
      className={className}
      onClick={onClick}
    />
  );
}

function SavedAudioBadge() {
  const [phase, setPhase] = useState<"visible" | "fading" | "gone">("visible");

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setPhase("fading"), 3000);
    const hideTimer = window.setTimeout(() => setPhase("gone"), 3500);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <span
      className={`shrink-0 text-sm text-zinc-600 transition-opacity duration-500 ${
        phase === "visible" ? "opacity-100" : "opacity-0"
      }`}
    >
      Saved audio
    </span>
  );
}

function DesktopAudioControls({
  deck,
  slide,
  variant,
  mode,
  voiceRate,
  autoplay,
  onVoiceRateChange,
  onAutoplayChange,
  onDeckChanged,
  onMessage,
}: {
  deck: DeckManifest;
  slide?: SlideTranscript;
  variant: SlideTranscriptVariant | null;
  mode: TranscriptMode;
  voiceRate: number;
  autoplay: boolean;
  onVoiceRateChange: (rate: number) => void;
  onAutoplayChange: (autoplay: boolean) => void;
  onDeckChanged: (deck: DeckManifest) => void;
  onMessage: (text: string, options?: { isError?: boolean }) => void;
}) {
  const speechText = variant?.speechText ?? "";
  const variantAudioPath = variant?.audioPath;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRef = useRef<SpeechControlsHandle | null>(null);
  const userStoppedRef = useRef(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioLoadFailed, setAudioLoadFailed] = useState(false);
  const [isGeneratingDeck, setIsGeneratingDeck] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const playLabel = isPaused ? "Resume" : "Play";

  const handleSpeechPlaybackChange = useCallback(
    (playing: boolean, paused: boolean) => {
      if (!audioUrl && !variantAudioPath) {
        setIsPlaying(playing);
        setIsPaused(paused);
      }
    },
    [audioUrl, variantAudioPath],
  );

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = voiceRate;
    }
  }, [voiceRate, audioUrl]);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    const resetTimer = window.setTimeout(() => {
      setAudioUrl("");
      setAudioLoadFailed(false);
      setIsLoadingAudio(Boolean(variantAudioPath));
      setIsPlaying(false);
      setIsPaused(false);
      userStoppedRef.current = false;
    }, 0);

    async function loadAudio() {
      if (!variantAudioPath || !slide) {
        setAudioLoadFailed(false);
        setIsLoadingAudio(false);
        return;
      }

      const result = await desktopApi().getSlideAudioBytes(deck.id, slide.slideNumber, mode);

      if (!result.ok) {
        setAudioLoadFailed(true);
        onMessage(result.error, { isError: true });
        setIsLoadingAudio(false);
        return;
      }

      if (!result.data) {
        setAudioLoadFailed(true);
        onMessage("Saved audio file is missing. Regenerate slide audio.", { isError: true });
        setIsLoadingAudio(false);
        return;
      }

      objectUrl = toObjectUrl(result.data, "audio/wav");

      if (!cancelled) {
        setAudioUrl(objectUrl);
        setAudioLoadFailed(false);
        setIsLoadingAudio(false);
      }
    }

    void loadAudio();

    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [deck.id, mode, onMessage, slide, variantAudioPath]);

  useEffect(() => {
    if (!autoplay || userStoppedRef.current) return;

    if (audioUrl && audioRef.current) {
      const playback = audioRef.current.play();
      if (playback) {
        playback
          .then(() => {
            setIsPlaying(true);
            setIsPaused(false);
          })
          .catch(() => {
            onMessage("Press play to hear this slide.");
          });
      }
      return;
    }

    if (!audioUrl && !isLoadingAudio && speechText.trim() && !variantAudioPath) {
      const timer = window.setTimeout(() => {
        speechRef.current?.play();
        setIsPlaying(true);
        setIsPaused(false);
      }, 250);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [audioUrl, autoplay, deck.id, isLoadingAudio, onMessage, slide?.slideNumber, speechText, variantAudioPath]);

  async function generateDeckAudio() {
    setIsGeneratingDeck(true);
    onMessage(`Generating Piper audio for all slides (${TRANSCRIPT_MODE_PRESETS[mode].label})...`);

    try {
      const result = await desktopApi().generateDeckAudio(deck.id, mode);

      if (!result.ok) throw new Error(result.error);

      onDeckChanged(result.data);
      onMessage("Deck audio generated.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not generate deck audio.", {
        isError: true,
      });
    } finally {
      setIsGeneratingDeck(false);
    }
  }

  function handlePlay() {
    userStoppedRef.current = false;

    if (variantAudioPath && !audioUrl) {
      onMessage(
        audioLoadFailed
          ? "Saved audio could not be loaded. Regenerate slide audio."
          : "Loading saved audio...",
        { isError: audioLoadFailed },
      );
      if (audioLoadFailed) return;
    }

    if (audioUrl && audioRef.current) {
      const playback = audioRef.current.play();
      if (playback) {
        playback
          .then(() => {
            setIsPlaying(true);
            setIsPaused(false);
          })
          .catch(() => onMessage("Press play to hear this slide."));
      }
      return;
    }

    if (!variantAudioPath) {
      speechRef.current?.play();
      setIsPlaying(true);
      setIsPaused(false);
    }
  }

  function handlePause() {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPaused(true);
      return;
    }

    speechRef.current?.pause();
    setIsPaused(true);
  }

  function handleStop() {
    userStoppedRef.current = true;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    speechRef.current?.stop();
    setIsPlaying(false);
    setIsPaused(false);
  }

  return (
    <div className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto overflow-y-visible">
      <SpeechControls
        ref={speechRef}
        text={speechText}
        slideKey={`${deck.id}-${slide?.slideNumber ?? 0}-${mode}`}
        rate={voiceRate}
        onError={(error) => onMessage(error, { isError: true })}
        onPlaybackChange={handleSpeechPlaybackChange}
        showControls={false}
      />

      {audioUrl ? (
        <audio
          ref={audioRef}
          key={`audio-${audioUrl}`}
          src={audioUrl}
          className="hidden"
          onPlay={() => {
            userStoppedRef.current = false;
            setIsPlaying(true);
            setIsPaused(false);
          }}
          onPause={() => {
            if (audioRef.current?.currentTime === 0) {
              setIsPlaying(false);
              setIsPaused(false);
              return;
            }
            setIsPaused(true);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setIsPaused(false);
          }}
        />
      ) : null}

      <button
        type="button"
        onClick={handlePlay}
        disabled={!slide || !speechText.trim() || isLoadingAudio}
        aria-label={playLabel}
        title={playLabel}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-white hover:bg-accent-strong"
      >
        <Play size={17} />
      </button>
      <button
        type="button"
        onClick={handlePause}
        disabled={!isPlaying || isPaused || isLoadingAudio}
        aria-label="Pause"
        title="Pause"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-panel hover:bg-panel-muted"
      >
        <Pause size={17} />
      </button>
      <button
        type="button"
        onClick={handleStop}
        disabled={!isPlaying && !isPaused}
        aria-label="Stop"
        title="Stop"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-panel hover:bg-panel-muted"
      >
        <Square size={17} />
      </button>
      <VoiceSpeedMenu value={voiceRate} onChange={onVoiceRateChange} compact />
      <button
        type="button"
        onClick={() => onAutoplayChange(!autoplay)}
        aria-label={autoplay ? "Autoplay on" : "Autoplay off"}
        title={autoplay ? "Autoplay on" : "Autoplay off"}
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
          autoplay
            ? "border-accent bg-accent/10 text-accent"
            : "border-line bg-panel hover:bg-panel-muted"
        }`}
      >
        <CirclePlay size={17} />
      </button>
      <button
        type="button"
        onClick={() => void generateDeckAudio()}
        disabled={isGeneratingDeck}
        aria-label="Generate all slides"
        title="Generate all slides"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-panel hover:bg-panel-muted"
      >
        <FileAudio size={17} />
      </button>

      {isLoadingAudio ? (
        <span className="shrink-0 text-sm text-zinc-600">Loading...</span>
      ) : null}
      {audioUrl ? <SavedAudioBadge key={`saved-${audioUrl}`} /> : null}
      {variant?.ttsStatus === "error" && variant.ttsError ? (
        <span className="shrink-0 text-sm text-red-600">{variant.ttsError}</span>
      ) : null}
    </div>
  );
}

export function DesktopApp() {
  const resizeRef = useRef<HTMLDivElement | null>(null);
  const viewerSlideButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const { message, isVisible, showMessage } = useAutoDismissMessage();
  const [isMounted, setIsMounted] = useState(false);
  const [view, setView] = useState<ViewMode>("library");
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [folders, setFolders] = useState<DeckFolder[]>([]);
  const [activeDeck, setActiveDeck] = useState<DeckManifest | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [newDeckTitle, setNewDeckTitle] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [editingDeckTitle, setEditingDeckTitle] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  const activeSlide = activeDeck?.slides[activeSlideIndex];
  const transcriptMode = settings.transcriptMode;
  const activeVariant = activeSlide ? resolveVariant(activeSlide, transcriptMode) : null;
  const activeModePreset = TRANSCRIPT_MODE_PRESETS[transcriptMode];
  const deckSlideCount = effectiveSlideCount(activeDeck, pdfPageCount);
  const currentPageNumber = activeSlide?.slideNumber ?? activeSlideIndex + 1;
  const currentSlideTitle = activeSlide?.title ?? `Slide ${currentPageNumber}`;

  const handlePdfPageCount = useCallback((count: number) => {
    setPdfPageCount((current) => Math.max(current, count));
  }, []);

  const slideListItems = useMemo(() => {
    if (!activeDeck || deckSlideCount === 0) return [];

    return Array.from({ length: deckSlideCount }, (_, index) => {
      const slide = activeDeck.slides[index];
      return {
        index,
        slideNumber: slide?.slideNumber ?? index + 1,
        title: slide?.title ?? `Slide ${index + 1}`,
      };
    });
  }, [activeDeck, deckSlideCount]);

  const isElectron = isMounted && Boolean(window.slideTutor);

  const loadDecks = useCallback(async () => {
    if (!window.slideTutor) return;

    const result = await desktopApi().listDecks();

    if (result.ok) setDecks(result.data);
    else showMessage(result.error, { isError: true });
  }, [showMessage]);

  const loadFolders = useCallback(async () => {
    if (!window.slideTutor) return;

    const result = await desktopApi().listFolders();

    if (result.ok) setFolders(result.data);
    else showMessage(result.error, { isError: true });
  }, [showMessage]);

  const loadSettings = useCallback(async () => {
    if (!window.slideTutor) return;

    const result = await desktopApi().getSettings();

    if (result.ok) setSettings(result.data);
    else showMessage(result.error, { isError: true });
  }, [showMessage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const timer = window.setTimeout(() => {
      loadDecks();
      loadFolders();
      loadSettings();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isMounted, loadDecks, loadFolders, loadSettings]);

  async function persistSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    if (!window.slideTutor) return;

    const result = await desktopApi().saveSettings(nextSettings);
    if (!result.ok) showMessage(result.error, { isError: true });
  }

  function updateAutoSetting(patch: Partial<AppSettings>) {
    const nextSettings = { ...settings, ...patch };
    persistSettings(nextSettings);
  }

  useEffect(() => {
    const nextPageCount = activeDeck?.pageCount ?? activeDeck?.slides.length ?? 0;
    const timer = window.setTimeout(() => setPdfPageCount(nextPageCount), 0);
    return () => window.clearTimeout(timer);
  }, [activeDeck]);

  useEffect(() => {
    if (!activeDeck || deckSlideCount === 0) return;
    if (activeSlideIndex > deckSlideCount - 1) {
      const timer = window.setTimeout(() => setActiveSlideIndex(deckSlideCount - 1), 0);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [activeDeck, activeSlideIndex, deckSlideCount]);

  function openZoomOverlay(page: number) {
    setZoomScale(1);
    setZoomPage(page);
  }

  function closeZoomOverlay() {
    setZoomPage(null);
    setZoomScale(1);
  }

  async function openDeck(deckId: string, mode: ViewMode) {
    setIsBusy(true);
    showMessage("");

    try {
      const result = await desktopApi().getDeck(deckId);

      if (!result.ok) throw new Error(result.error);

      setActiveDeck(result.data);
      setEditingDeckTitle(result.data.title);
      setActiveSlideIndex(0);
      setView(mode);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not open deck.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function importPdf() {
    setIsBusy(true);
    showMessage("");

    try {
      const result = await desktopApi().choosePdfAndCreateDeck(newDeckTitle);

      if (!result.ok) throw new Error(result.error);

      if (!result.data) {
        showMessage("PDF import cancelled.");
        return;
      }

      setNewDeckTitle("");
      setActiveDeck(result.data);
      setEditingDeckTitle(result.data.title);
      setActiveSlideIndex(0);
      setView("editor");
      await loadDecks();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not import PDF.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function importPdfFromDrop(file: File) {
    if (!window.slideTutor) {
      showMessage("Drag-and-drop import is only available in the desktop app.", { isError: true });
      return;
    }

    setIsBusy(true);
    showMessage("");

    try {
      const sourcePath = desktopApi().getPathForFile(file);
      const result = await desktopApi().createDeckFromPdfPath(sourcePath, newDeckTitle);

      if (!result.ok) throw new Error(result.error);

      setNewDeckTitle("");
      await loadDecks();
      showMessage(`Imported "${result.data.title}" to Unfiled.`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not import PDF.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;

    setIsBusy(true);
    showMessage("");

    try {
      const result = await desktopApi().createFolder(newFolderName);

      if (!result.ok) throw new Error(result.error);

      setNewFolderName("");
      await loadFolders();
      showMessage(`Folder created: ${result.data.name}`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not create folder.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function assignFolder(deckId: string, folderId: string | null) {
    const result = await desktopApi().assignDeckFolder(deckId, folderId);

    if (!result.ok) {
      showMessage(result.error, { isError: true });
      return;
    }

    if (activeDeck?.id === deckId) setActiveDeck(result.data);
    await loadDecks();
  }

  async function deleteDeck(deckId: string, title: string) {
    if (
      !window.confirm(
        `Delete "${title}"? This permanently removes the PDF, transcripts, and audio.`,
      )
    ) {
      return;
    }

    setIsBusy(true);
    showMessage("Deleting deck...");

    try {
      const result = await desktopApi().deleteDeck(deckId);

      if (!result.ok) throw new Error(result.error);

      if (activeDeck?.id === deckId) {
        setActiveDeck(null);
        setView("library");
        setActiveSlideIndex(0);
      }

      await loadDecks();
      showMessage(`Deleted "${title}".`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not delete deck.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function renameActiveDeck() {
    if (!activeDeck) return;

    setIsBusy(true);
    showMessage("");

    try {
      const result = await desktopApi().renameDeck(activeDeck.id, editingDeckTitle);

      if (!result.ok) throw new Error(result.error);

      setActiveDeck(result.data);
      setEditingDeckTitle(result.data.title);
      showMessage("Deck title saved.");
      await loadDecks();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not rename deck.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function generateTranscripts() {
    if (!activeDeck) return;

    const mode = settings.transcriptMode;
    const presetLabel = TRANSCRIPT_MODE_PRESETS[mode].label;

    setIsBusy(true);
    showMessage(`Generating ${presetLabel} transcripts with Gemini...`);

    try {
      const result = await desktopApi().generateTranscripts(activeDeck.id, mode);

      if (!result.ok) throw new Error(result.error);

      setActiveDeck(result.data);
      setEditingDeckTitle(result.data.title);
      setActiveSlideIndex(0);
      showMessage(`${presetLabel} transcripts generated. Review and edit before publishing.`);
      await loadDecks();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not generate transcripts.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function importExternalTranscripts(
    slides: ImportedSlideInput[],
    mode: TranscriptMode,
  ) {
    if (!activeDeck) return;

    setIsBusy(true);
    const presetLabel = TRANSCRIPT_MODE_PRESETS[mode].label;
    showMessage(`Importing ${presetLabel} transcripts...`);

    try {
      const result = await desktopApi().importExternalTranscripts(activeDeck.id, slides, mode);

      if (!result.ok) throw new Error(result.error);

      setActiveDeck(result.data);
      setEditingDeckTitle(result.data.title);
      setActiveSlideIndex(0);
      showMessage(
        `Updated ${presetLabel} transcripts for ${slides.length} slides. Review and publish when ready.`,
      );
      await loadDecks();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not import transcripts.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  function updateLocalSlideTitle(title: string) {
    if (!activeDeck || !activeSlide) return;

    setActiveDeck({
      ...activeDeck,
      slides: activeDeck.slides.map((slide) =>
        slide.slideNumber === activeSlide.slideNumber ? { ...slide, title } : slide,
      ),
    });
  }

  function updateLocalVariant(patch: Partial<SlideTranscriptVariant>) {
    if (!activeDeck || !activeSlide) return;

    const mode = settings.transcriptMode;

    setActiveDeck({
      ...activeDeck,
      slides: activeDeck.slides.map((slide) => {
        if (slide.slideNumber !== activeSlide.slideNumber) return slide;

        const current = resolveVariant(slide, mode) ?? emptyVariant();
        const nextVariant: SlideTranscriptVariant = { ...current, ...patch };
        const byMode = { ...(slide.transcriptsByMode ?? {}), [mode]: nextVariant };
        const next: SlideTranscript = { ...slide, transcriptsByMode: byMode };

        if (mode === DEFAULT_TRANSCRIPT_MODE) {
          next.transcriptMarkdown = nextVariant.transcriptMarkdown;
          next.transcriptLatex = nextVariant.transcriptLatex;
          next.speechText = nextVariant.speechText;
          next.keyTerms = nextVariant.keyTerms;
        }

        return next;
      }),
    });
  }

  async function saveActiveSlide() {
    if (!activeDeck || !activeSlide) return;

    const mode = settings.transcriptMode;
    const variant = resolveVariant(activeSlide, mode);

    if (!variant || !variant.transcriptMarkdown.trim() || !variant.speechText.trim()) {
      showMessage(
        `Generate a ${TRANSCRIPT_MODE_PRESETS[mode].label} transcript for this slide before saving.`,
        { isError: true },
      );
      return;
    }

    const update: SlideUpdate = {
      title: activeSlide.title,
      transcriptMarkdown: variant.transcriptMarkdown,
      transcriptLatex: variant.transcriptLatex || variant.transcriptMarkdown,
      speechText: variant.speechText,
      keyTerms: variant.keyTerms,
    };

    setIsBusy(true);
    showMessage("");

    try {
      const result = await desktopApi().saveSlide(
        activeDeck.id,
        activeSlide.slideNumber,
        update,
        mode,
      );

      if (!result.ok) throw new Error(result.error);

      setActiveDeck(result.data);
      showMessage("Slide saved locally.");
      await loadDecks();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not save slide.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function publishActiveDeck() {
    if (!activeDeck) return;

    setIsBusy(true);
    showMessage("");

    try {
      const result = await desktopApi().publishDeck(activeDeck.id);

      if (!result.ok) throw new Error(result.error);

      setActiveDeck(result.data);
      setEditingDeckTitle(result.data.title);
      setView("viewer");
      showMessage("Deck published locally.");
      await loadDecks();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not publish deck.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function saveAppSettings() {
    setIsBusy(true);
    showMessage("");

    try {
      const result = await desktopApi().saveSettings(settings);

      if (!result.ok) throw new Error(result.error);

      setSettings(result.data);
      showMessage("Settings saved locally.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not save settings.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function choosePath(kind: "exe" | "voice") {
    const result =
      kind === "exe"
        ? await desktopApi().choosePiperExecutable()
        : await desktopApi().choosePiperVoiceModel();

    if (!result.ok) {
      showMessage(result.error, { isError: true });
      return;
    }

    if (!result.data) return;

    setSettings((current) =>
      kind === "exe"
        ? { ...current, piperExecutablePath: result.data ?? "" }
        : { ...current, piperVoiceModelPath: result.data ?? "" },
    );
  }

  function startResize(event: PointerEvent<HTMLButtonElement>) {
    if (!resizeRef.current) return;

    event.preventDefault();
    const container = resizeRef.current;
    let finalPercent = settings.viewerPdfPanePercent;

    function onMove(moveEvent: globalThis.PointerEvent) {
      const rect = container.getBoundingClientRect();
      const nextPercent = clamp(
        ((moveEvent.clientX - rect.left) / rect.width) * 100,
        35,
        75,
      );
      finalPercent = Math.round(nextPercent);
      setSettings((current) => ({
        ...current,
        viewerPdfPanePercent: finalPercent,
      }));
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      persistSettings({
        ...settings,
        viewerPdfPanePercent: finalPercent,
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const slideCountLabel = useMemo(() => {
    if (!activeDeck) return "";
    return deckSlideCount > 0
      ? `Slide ${activeSlideIndex + 1} of ${deckSlideCount}`
      : "No slides yet";
  }, [activeDeck, activeSlideIndex, deckSlideCount]);

  const viewerImmersive = useMemo(
    () => !settings.viewerShowTranscript && !settings.viewerShowSlideList,
    [settings.viewerShowSlideList, settings.viewerShowTranscript],
  );

  useEffect(() => {
    if (view !== "viewer" || !activeDeck) return;

    const slideCount = deckSlideCount;
    if (slideCount === 0) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          target.closest('[role="listbox"]')
        ) {
          return;
        }
      }

      event.preventDefault();

      if (event.key === "ArrowRight") {
        setActiveSlideIndex((current) => Math.min(slideCount - 1, current + 1));
      } else {
        setActiveSlideIndex((current) => Math.max(0, current - 1));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, activeDeck, deckSlideCount]);

  useEffect(() => {
    if (view !== "viewer" || !settings.viewerShowSlideList) return;

    const button = viewerSlideButtonRefs.current.get(activeSlideIndex);
    button?.scrollIntoView({ block: "nearest" });
  }, [view, activeSlideIndex, settings.viewerShowSlideList, deckSlideCount]);

  useEffect(() => {
    if (!zoomPage) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeZoomOverlay();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomPage]);

  const shellMaxWidth =
    view === "viewer"
      ? "max-w-[1760px]"
      : view === "editor"
        ? "max-w-[1600px]"
        : "max-w-7xl";

  const decksByFolder = useMemo(() => {
    const map = new Map<string, DeckSummary[]>();
    for (const deck of decks) {
      const key = deck.folderId ?? "unfiled";
      map.set(key, [...(map.get(key) ?? []), deck]);
    }
    return map;
  }, [decks]);

  if (!isMounted) {
    return (
      <main className="min-h-screen bg-background px-5 py-5 text-foreground">
        <div className="mx-auto max-w-7xl rounded-lg border border-line bg-panel p-5 text-sm text-zinc-600">
          Loading Slide Tutor...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-4 text-foreground sm:px-5 sm:py-5">
      <div className={`mx-auto flex w-full flex-col gap-5 ${shellMaxWidth}`}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <h1 className="flex items-baseline gap-2 text-xl font-semibold">
            <span className="text-accent">Slide Tutor</span>
            <span className="hidden text-zinc-400 sm:inline">·</span>
            <span className="hidden text-base font-normal text-zinc-600 sm:inline">
              Local PDF slide lessons
            </span>
          </h1>
          <nav className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setView("library")}
              aria-current={view === "library" || view === "editor" || view === "viewer"}
              className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors ${
                view === "library"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-panel hover:bg-panel-muted"
              }`}
            >
              <Library size={17} />
              Library
            </button>
            <button
              type="button"
              onClick={() => setView("settings")}
              aria-current={view === "settings"}
              className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors ${
                view === "settings"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-panel hover:bg-panel-muted"
              }`}
            >
              <Settings size={17} />
              Settings
            </button>
          </nav>
        </header>

        {!isElectron ? (
          <div className="rounded-lg border border-warn bg-panel p-5 text-sm text-zinc-700">
            This desktop version needs Electron to access local files, Gemini settings,
            and Piper. Run <code className="font-mono">npm run desktop:dev</code>.
          </div>
        ) : null}

        {message ? (
          <p
            className={`rounded-md border border-line bg-panel-muted px-3 py-2 text-sm text-zinc-700 transition-opacity duration-500 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {message}
          </p>
        ) : null}

        {view === "library" ? (
          <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-lg border border-line bg-panel p-5">
              <BookOpen className="mb-4 text-accent" size={34} />
              <h2 className="text-xl font-semibold">Import a PDF deck</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-700">
                The PDF is copied into the local app data folder. Gemini is used only
                when you generate transcripts.
              </p>
              <label className="mt-5 grid gap-2 text-sm font-medium">
                Optional deck title
                <input
                  value={newDeckTitle}
                  onChange={(event) => setNewDeckTitle(event.target.value)}
                  className="h-11 rounded-md border border-line bg-white px-3 outline-none focus:border-accent"
                  placeholder="Control systems lecture"
                />
              </label>
              <button
                type="button"
                onClick={importPdf}
                disabled={!isElectron || isBusy}
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
              >
                <Upload size={18} />
                Choose PDF
              </button>

              <div className="mt-6 border-t border-line pt-5">
                <h2 className="text-lg font-semibold">Class folders</h2>
                <div className="mt-3 flex gap-2">
                  <input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-md border border-line bg-white px-3 outline-none focus:border-accent"
                    placeholder="ENGR 321"
                  />
                  <button
                    type="button"
                    onClick={createFolder}
                    disabled={!newFolderName.trim() || isBusy}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                  >
                    <Plus size={17} />
                    Create
                  </button>
                </div>
              </div>
            </div>

            <LocalLibraryDropZone
              isElectron={isElectron}
              isBusy={isBusy}
              onDropPdf={(file) => void importPdfFromDrop(file)}
              onMessage={showMessage}
            >
              <div className="flex items-center justify-between border-b border-line p-5">
                <div>
                  <h2 className="text-lg font-semibold">Local Library</h2>
                  <p className="mt-0.5 text-sm text-zinc-600">Drag a PDF here to import</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    loadDecks();
                    loadFolders();
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                >
                  <RefreshCw size={17} />
                  Refresh
                </button>
              </div>
              <div className="scroll-area max-h-[min(720px,calc(100vh-260px))] overflow-auto">
                {decks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-panel-muted text-accent">
                      <BookOpen size={26} />
                    </div>
                    <p className="text-sm font-semibold text-zinc-700">No decks yet</p>
                    <p className="max-w-xs text-sm text-zinc-600">
                      Import a PDF on the left or drag one onto this library panel to create
                      your first deck, then generate transcripts and study with narrated slides.
                    </p>
                  </div>
                ) : (
                  [
                    ...folders.map((folder) => ({ id: folder.id, name: folder.name })),
                    { id: "unfiled", name: "Unfiled" },
                  ].map((folder) => {
                    const folderDecks = decksByFolder.get(folder.id) ?? [];
                    if (folderDecks.length === 0 && folder.id !== "unfiled") return null;

                    return (
                      <div key={folder.id} className="border-b border-line">
                        <div className="flex items-center gap-2 bg-panel-muted px-4 py-2 text-sm font-semibold">
                          <Folder size={16} />
                          {folder.name}
                        </div>
                        {folderDecks.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-zinc-600">No decks.</p>
                        ) : (
                          folderDecks.map((deck) => (
                            <div
                              key={deck.id}
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-panel-muted/50"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-panel-muted text-accent">
                                  <FileText size={18} />
                                </span>
                                <div className="min-w-0">
                                  <h3 className="truncate font-semibold">{deck.title}</h3>
                                  <p className="text-sm text-zinc-600">
                                    {deck.slideCount} slides · {statusText(deck)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <FolderSelectMenu
                                  value={deck.folderId ?? null}
                                  folders={folders}
                                  onChange={(folderId) => assignFolder(deck.id, folderId)}
                                />
                                <button
                                  type="button"
                                  onClick={() => openDeck(deck.id, "editor")}
                                  className="h-10 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openDeck(deck.id, "viewer")}
                                  className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-strong"
                                >
                                  <Play size={17} />
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteDeck(deck.id, deck.title)}
                                  disabled={isBusy}
                                  className="inline-flex h-10 items-center gap-2 rounded-md border border-danger/30 px-3 text-sm font-semibold text-danger hover:bg-danger/5"
                                >
                                  <Trash2 size={17} />
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </LocalLibraryDropZone>
          </section>
        ) : null}

        {view === "settings" ? (
          <section className="grid max-w-3xl gap-5">
            <div>
              <h2 className="text-xl font-semibold">Settings</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Stored locally on this device. Keys are only used when you generate content.
              </p>
            </div>

            <div className="rounded-lg border border-line bg-panel p-5">
              <h3 className="text-base font-semibold">AI transcripts</h3>
              <p className="mt-1 text-sm text-zinc-600">
                Used by Gemini to generate teaching notes from your slides.
              </p>
              <label className="mt-4 grid gap-2 text-sm font-medium">
                Gemini API key
                <input
                  value={settings.geminiApiKey}
                  onChange={(event) =>
                    setSettings({ ...settings, geminiApiKey: event.target.value })
                  }
                  type="password"
                  placeholder="AIza..."
                  className="h-11 rounded-md border border-line bg-white px-3 outline-none focus:border-accent"
                />
              </label>

              <div className="mt-4 grid gap-2 text-sm font-medium">
                <span>Transcript generation mode</span>
                <TranscriptModeMenu
                  value={settings.transcriptMode}
                  onChange={(mode) => persistSettings({ ...settings, transcriptMode: mode })}
                />
                <p className="text-sm font-normal text-zinc-600">
                  {TRANSCRIPT_MODE_PRESETS[settings.transcriptMode].description} Transcripts are
                  saved separately per mode, so switching modes never overwrites another mode.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panel p-5">
              <h3 className="text-base font-semibold">Narration (Piper)</h3>
              <p className="mt-1 text-sm text-zinc-600">
                Defaults to the bundled <code className="font-mono">piper/en_US-john-medium.onnx</code>{" "}
                voice. Leave paths blank to use it with <code className="font-mono">python -m piper</code> or an
                optional <code className="font-mono">piper.exe</code> in that folder.
              </p>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm font-medium">
                  Piper executable (optional)
                  <div className="flex gap-2">
                    <input
                      value={settings.piperExecutablePath}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          piperExecutablePath: event.target.value,
                        })
                      }
                      placeholder="Leave blank to use the bundled voice"
                      className="h-11 min-w-0 flex-1 rounded-md border border-line bg-white px-3 outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => choosePath("exe")}
                      className="h-11 shrink-0 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                    >
                      Browse
                    </button>
                  </div>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Piper voice model (.onnx, optional)
                  <div className="flex gap-2">
                    <input
                      value={settings.piperVoiceModelPath}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          piperVoiceModelPath: event.target.value,
                        })
                      }
                      placeholder="Leave blank to use the bundled voice"
                      className="h-11 min-w-0 flex-1 rounded-md border border-line bg-white px-3 outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => choosePath("voice")}
                      className="h-11 shrink-0 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                    >
                      Browse
                    </button>
                  </div>
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={saveAppSettings}
              disabled={!isElectron || isBusy}
              className="inline-flex h-11 w-fit items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
            >
              <Save size={18} />
              Save Settings
            </button>
          </section>
        ) : null}

        {view === "editor" && activeDeck ? (
          <section className="grid h-[calc(100vh-110px)] min-h-0 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col rounded-lg border border-line bg-panel">
              <div className="shrink-0 border-b border-line p-3 text-sm font-semibold">
                {statusText(activeDeck)}
              </div>
              <div className="scroll-area min-h-0 flex-1 overflow-auto">
                {slideListItems.length === 0 ? (
                  <p className="p-4 text-sm text-zinc-600">Loading PDF pages...</p>
                ) : (
                  slideListItems.map((item) => (
                    <button
                      key={item.slideNumber}
                      type="button"
                      onClick={() => setActiveSlideIndex(item.index)}
                      aria-current={item.index === activeSlideIndex}
                      className={`block w-full border-b border-line px-3 py-2.5 text-left text-sm transition-colors hover:bg-panel-muted ${
                        item.index === activeSlideIndex
                          ? "border-l-2 border-l-accent bg-panel-muted font-semibold"
                          : "border-l-2 border-l-transparent"
                      }`}
                    >
                      <span className={item.index === activeSlideIndex ? "text-accent" : "text-zinc-500"}>
                        Slide {item.slideNumber}
                      </span>
                      <span className="mt-0.5 block truncate text-zinc-600">
                        {item.title}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </aside>

            <div className="grid gap-4">
              <div className="grid gap-3 rounded-lg border border-line bg-panel p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <label className="grid min-w-[280px] flex-1 gap-2 text-sm font-medium">
                    Deck title
                    <input
                      value={editingDeckTitle}
                      onChange={(event) => setEditingDeckTitle(event.target.value)}
                      className="h-10 rounded-md border border-line bg-white px-3 text-xl font-semibold caret-accent outline-none focus:border-accent"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={renameActiveDeck}
                      disabled={isBusy || !editingDeckTitle.trim()}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                    >
                      <Save size={17} />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={generateTranscripts}
                      disabled={isBusy}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                    >
                      <Wand2 size={17} />
                      Generate
                    </button>
                    <button
                      type="button"
                      onClick={publishActiveDeck}
                      disabled={!activeDeck.slides.length || isBusy}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-strong"
                    >
                      <Send size={17} />
                      Publish
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
                  <span>{slideCountLabel}</span>
                  <label className="flex items-center gap-2">
                    Folder
                    <FolderSelectMenu
                      compact
                      className="w-44"
                      value={activeDeck.folderId ?? null}
                      folders={folders}
                      onChange={(folderId) => assignFolder(activeDeck.id, folderId)}
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <span>Transcript mode</span>
                    <div className="w-56">
                      <TranscriptModeMenu
                        compact
                        value={settings.transcriptMode}
                        onChange={(mode) =>
                          persistSettings({ ...settings, transcriptMode: mode })
                        }
                      />
                    </div>
                  </div>
                </div>
                <p className="text-sm text-zinc-600">
                  Generate creates <span className="font-semibold">{activeModePreset.label}</span>{" "}
                  transcripts for every slide. Other modes are kept separately.
                </p>
              </div>

              <ExternalTranscriptImport
                key={activeDeck.id}
                deck={activeDeck}
                isBusy={isBusy}
                onImport={importExternalTranscripts}
                onMessage={showMessage}
              />

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)]">
                <PdfFromDeck
                  deckId={activeDeck.id}
                  pageNumber={currentPageNumber}
                  onPageCount={handlePdfPageCount}
                  onClick={() => openZoomOverlay(currentPageNumber)}
                />
                <div className="rounded-lg border border-line bg-panel">
                  <div className="flex items-center justify-between gap-3 border-b border-line p-4">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold">Review script</h2>
                      <p className="text-xs text-zinc-500">
                        {activeSlide
                          ? `Editing ${activeModePreset.label} transcript`
                          : `Slide ${currentPageNumber} · No transcription yet`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={saveActiveSlide}
                      disabled={isBusy || !activeVariant}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-strong"
                    >
                      <Save size={17} />
                      Save
                    </button>
                  </div>
                  <div className="grid gap-4 p-4">
                    {activeSlide ? (
                      <>
                        <label className="grid gap-2 text-sm font-medium">
                          Title
                          <input
                            value={activeSlide.title}
                            onChange={(event) => updateLocalSlideTitle(event.target.value)}
                            className="h-10 rounded-md border border-line px-3 outline-none focus:border-accent"
                          />
                        </label>

                        {activeVariant ? (
                          <>
                            <label className="grid gap-2 text-sm font-medium">
                              Transcript Markdown with LaTeX
                              <textarea
                                value={activeVariant.transcriptMarkdown}
                                onChange={(event) =>
                                  updateLocalVariant({
                                    transcriptMarkdown: event.target.value,
                                    transcriptLatex: event.target.value,
                                  })
                                }
                                className="min-h-[9rem] resize-y rounded-md border border-line bg-white px-3 py-2 caret-accent outline-none focus:border-accent"
                              />
                            </label>
                            <label className="grid gap-2 text-sm font-medium">
                              Speech text
                              <textarea
                                value={activeVariant.speechText}
                                onChange={(event) =>
                                  updateLocalVariant({ speechText: event.target.value })
                                }
                                rows={5}
                                className="min-h-[5rem] resize-y rounded-md border border-line bg-white px-3 py-2 caret-accent outline-none focus:border-accent"
                              />
                            </label>
                            <label className="grid gap-2 text-sm font-medium">
                              Key terms, comma separated
                              <input
                                value={activeVariant.keyTerms.join(", ")}
                                onChange={(event) =>
                                  updateLocalVariant({
                                    keyTerms: event.target.value
                                      .split(",")
                                      .map((term) => term.trim())
                                      .filter(Boolean),
                                  })
                                }
                                className="h-10 rounded-md border border-line px-3 outline-none focus:border-accent"
                              />
                            </label>
                            <div className="rounded-md border border-line bg-panel-muted p-4">
                              <p className="mb-2 text-sm font-semibold">Preview</p>
                              <MarkdownTranscript
                                markdown={activeVariant.transcriptMarkdown}
                                latex={activeVariant.transcriptLatex}
                                mathMode={settings.transcriptMathMode}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line bg-panel-muted px-6 py-10 text-center">
                            <FileText className="text-zinc-400" size={28} />
                            <p className="text-sm font-semibold text-zinc-700">
                              No {activeModePreset.label} transcript yet
                            </p>
                            <p className="max-w-sm text-sm text-zinc-600">
                              {activeModePreset.description} Use Generate above to create{" "}
                              {activeModePreset.label} transcripts for this deck without touching
                              other modes.
                            </p>
                            <button
                              type="button"
                              onClick={generateTranscripts}
                              disabled={isBusy}
                              className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
                            >
                              <Wand2 size={17} />
                              Generate {activeModePreset.label}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line bg-panel-muted px-6 py-10 text-center">
                        <FileText className="text-zinc-400" size={28} />
                        <p className="text-sm font-semibold text-zinc-700">
                          No transcription for {currentSlideTitle}
                        </p>
                        <p className="max-w-sm text-sm text-zinc-600">
                          You can browse the PDF slides here. Generate with Gemini or import from an
                          external LLM to add teaching notes for this page.
                        </p>
                        <button
                          type="button"
                          onClick={generateTranscripts}
                          disabled={isBusy}
                          className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
                        >
                          <Wand2 size={17} />
                          Generate transcripts
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {view === "viewer" && activeDeck ? (
          <section className="flex h-[calc(100vh-110px)] min-h-0 flex-col gap-3">
            <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold sm:text-xl">{activeDeck.title}</h2>
                <p className="text-sm text-zinc-600">
                  {slideCountLabel} · {folderName(folders, activeDeck.folderId)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-52">
                  <TranscriptModeMenu
                    compact
                    ariaLabel="Transcript mode"
                    value={settings.transcriptMode}
                    onChange={(mode) => updateAutoSetting({ transcriptMode: mode })}
                  />
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-line bg-panel-muted p-1">
                  <button
                    type="button"
                    aria-pressed={settings.viewerShowSlideList}
                    title="Toggle slide list"
                    onClick={() =>
                      updateAutoSetting({
                        viewerShowSlideList: !settings.viewerShowSlideList,
                      })
                    }
                    className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${
                      settings.viewerShowSlideList
                        ? "bg-panel text-accent shadow-sm"
                        : "text-zinc-600 hover:bg-panel"
                    }`}
                  >
                    <PanelLeft size={16} />
                    <span className="hidden sm:inline">Slides</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={settings.viewerShowTranscript}
                    title="Toggle transcript"
                    onClick={() =>
                      updateAutoSetting({
                        viewerShowTranscript: !settings.viewerShowTranscript,
                      })
                    }
                    className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${
                      settings.viewerShowTranscript
                        ? "bg-panel text-accent shadow-sm"
                        : "text-zinc-600 hover:bg-panel"
                    }`}
                  >
                    <FileText size={16} />
                    <span className="hidden sm:inline">Transcript</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setView("editor")}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                >
                  <Wand2 size={16} />
                  <span className="hidden sm:inline">Edit scripts</span>
                  <span className="sm:hidden">Edit</span>
                </button>
              </div>
            </header>

            {deckSlideCount > 0 ? (
              <>
                <main className="min-h-0 flex-1 overflow-hidden">
                  <section
                    className={`h-full min-h-0 overflow-hidden ${
                      settings.viewerShowSlideList
                        ? "grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]"
                        : "grid h-full"
                    }`}
                  >
                    {settings.viewerShowSlideList ? (
                      <aside className="scroll-area min-h-0 overflow-auto rounded-lg border border-line bg-panel">
                        <p className="sticky top-0 z-10 border-b border-line bg-panel/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 backdrop-blur">
                          Slides
                        </p>
                        {slideListItems.map((item) => (
                          <button
                            key={item.slideNumber}
                            ref={(node) => {
                              if (node) {
                                viewerSlideButtonRefs.current.set(item.index, node);
                              } else {
                                viewerSlideButtonRefs.current.delete(item.index);
                              }
                            }}
                            type="button"
                            onClick={() => setActiveSlideIndex(item.index)}
                            aria-current={item.index === activeSlideIndex}
                            className={`block w-full border-b border-line px-3 py-2.5 text-left text-sm transition-colors hover:bg-panel-muted ${
                              item.index === activeSlideIndex
                                ? "border-l-2 border-l-accent bg-panel-muted font-semibold"
                                : "border-l-2 border-l-transparent"
                            }`}
                          >
                            <span className={item.index === activeSlideIndex ? "text-accent" : "text-zinc-500"}>
                              Slide {item.slideNumber}
                            </span>
                            <span className="mt-0.5 block truncate text-zinc-600">
                              {item.title}
                            </span>
                          </button>
                        ))}
                      </aside>
                    ) : null}

                    {settings.viewerShowTranscript ? (
                      <div
                        ref={resizeRef}
                        className="grid h-full min-h-0 gap-0"
                        style={{
                          gridTemplateColumns: `${settings.viewerPdfPanePercent}% 10px minmax(0, 1fr)`,
                        }}
                      >
                        <div className="scroll-area min-h-0 min-w-0 overflow-auto pr-2">
                          <PdfFromDeck
                            deckId={activeDeck.id}
                            pageNumber={currentPageNumber}
                            onPageCount={handlePdfPageCount}
                            onClick={() => openZoomOverlay(currentPageNumber)}
                          />
                        </div>
                        <button
                          type="button"
                          aria-label="Resize PDF and transcript panes"
                          onPointerDown={startResize}
                          className="group flex h-full cursor-col-resize items-center justify-center"
                        >
                          <span className="h-full w-1 rounded-full bg-line transition-colors group-hover:bg-accent" />
                        </button>
                        <article className="ml-2 flex min-h-0 min-w-0 flex-col rounded-lg border border-line bg-panel">
                          <div className="shrink-0 border-b border-line px-5 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Transcript · {activeModePreset.label}
                            </p>
                            <h2 className="mt-0.5 text-lg font-semibold tracking-normal">
                              {currentSlideTitle}
                            </h2>
                          </div>
                          <div className="scroll-area min-h-0 flex-1 overflow-auto px-5 py-5">
                            {activeVariant ? (
                              <div className="mx-auto w-full max-w-[72ch]">
                                <MarkdownTranscript
                                  markdown={activeVariant.transcriptMarkdown}
                                  latex={activeVariant.transcriptLatex}
                                  mathMode={settings.transcriptMathMode}
                                />
                              </div>
                            ) : (
                              <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-10 text-center">
                                <FileText className="text-zinc-400" size={28} />
                                <p className="text-sm font-semibold text-zinc-700">
                                  No {activeModePreset.label} transcript for this slide yet.
                                </p>
                                <p className="text-sm text-zinc-600">
                                  {activeModePreset.description} Open Edit scripts and generate the{" "}
                                  {activeModePreset.label} transcript, or pick another mode above.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setView("editor")}
                                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-semibold hover:bg-panel-muted"
                                >
                                  <Wand2 size={16} />
                                  Edit scripts
                                </button>
                              </div>
                            )}
                          </div>
                        </article>
                      </div>
                    ) : (
                      <div
                        className={
                          viewerImmersive
                            ? "flex h-full min-h-0 items-center justify-center"
                            : "scroll-area min-h-0 overflow-auto"
                        }
                      >
                        <PdfFromDeck
                          deckId={activeDeck.id}
                          pageNumber={currentPageNumber}
                          onPageCount={handlePdfPageCount}
                          fitMode={viewerImmersive ? "contain" : "width"}
                          className={viewerImmersive ? "h-full w-full" : ""}
                          onClick={() => openZoomOverlay(currentPageNumber)}
                        />
                      </div>
                    )}
                  </section>
                </main>

                <footer className="relative z-10 shrink-0 overflow-visible rounded-lg border border-line bg-panel px-3 py-2">
                  <div className="flex items-center justify-between gap-3 overflow-visible">
                    <button
                      type="button"
                      onClick={() => setActiveSlideIndex((current) => Math.max(0, current - 1))}
                      disabled={activeSlideIndex === 0}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-semibold hover:bg-panel-muted"
                    >
                      Previous
                    </button>
                    <div
                      className={`flex min-w-0 flex-1 ${
                        viewerImmersive ? "justify-center" : "justify-center"
                      }`}
                    >
                      <DesktopAudioControls
                        deck={activeDeck}
                        slide={activeSlide}
                        variant={activeVariant}
                        mode={transcriptMode}
                        voiceRate={settings.voiceRate}
                        autoplay={settings.viewerAutoplayAudio}
                        onVoiceRateChange={(rate) =>
                          updateAutoSetting({ voiceRate: clamp(rate, 0.25, 2) })
                        }
                        onAutoplayChange={(value) =>
                          updateAutoSetting({ viewerAutoplayAudio: value })
                        }
                        onDeckChanged={setActiveDeck}
                        onMessage={showMessage}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveSlideIndex((current) =>
                          Math.min(deckSlideCount - 1, current + 1),
                        )
                      }
                      disabled={activeSlideIndex >= deckSlideCount - 1}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
                    >
                      Next
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <p className="rounded-lg border border-line bg-panel p-5 text-sm text-zinc-600">
                Loading PDF pages...
              </p>
            )}
          </section>
        ) : null}

        {zoomPage && activeDeck ? (
          <div className="fixed inset-0 z-50 grid bg-black/70 p-5">
            <div className="flex h-[calc(100vh-2.5rem)] min-h-0 flex-col rounded-lg bg-background">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel p-3">
                <div className="text-sm font-semibold">
                  {activeDeck.title} - slide {zoomPage}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setZoomScale((current) => clamp(current + 0.2, 0.8, 3))}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                  >
                    <ZoomIn size={16} />
                    Zoom in
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale((current) => clamp(current - 0.2, 0.8, 3))}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                  >
                    <ZoomOut size={16} />
                    Zoom out
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale(1)}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                  >
                    <RotateCcw size={16} />
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={closeZoomOverlay}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-strong"
                  >
                    <X size={16} />
                    Close
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-4">
                <div className="h-full w-full">
                  <PdfFromDeck
                    deckId={activeDeck.id}
                    pageNumber={zoomPage}
                    fitMode="contain"
                    scaleMultiplier={zoomScale}
                    className="h-full w-full border-0 bg-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
