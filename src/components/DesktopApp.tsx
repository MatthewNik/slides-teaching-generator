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
} from "@/lib/types";
import type { ImportedSlideInput } from "@/lib/schemas";
import type { SlideUpdate } from "@/types/electron";
import { ExternalTranscriptImport } from "./ExternalTranscriptImport";
import { useAutoDismissMessage } from "@/hooks/useAutoDismissMessage";
import { MarkdownTranscript } from "./MarkdownTranscript";
import { PdfSlide } from "./PdfSlide";
import { SpeechControls, type SpeechControlsHandle } from "./SpeechControls";
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
};

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

function PdfFromDeck({
  deckId,
  pageNumber,
  scaleMultiplier = 1,
  fitMode = "width",
  className = "",
  onClick,
}: {
  deckId: string;
  pageNumber: number;
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
      scaleMultiplier={scaleMultiplier}
      fitMode={fitMode}
      className={className}
      onClick={onClick}
    />
  );
}

function DesktopAudioControls({
  deck,
  slide,
  voiceRate,
  autoplay,
  onVoiceRateChange,
  onAutoplayChange,
  onDeckChanged,
  onMessage,
}: {
  deck: DeckManifest;
  slide: SlideTranscript;
  voiceRate: number;
  autoplay: boolean;
  onVoiceRateChange: (rate: number) => void;
  onAutoplayChange: (autoplay: boolean) => void;
  onDeckChanged: (deck: DeckManifest) => void;
  onMessage: (text: string, options?: { isError?: boolean }) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRef = useRef<SpeechControlsHandle | null>(null);
  const userStoppedRef = useRef(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioLoadFailed, setAudioLoadFailed] = useState(false);
  const [isGeneratingDeck, setIsGeneratingDeck] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showSavedBadge, setShowSavedBadge] = useState(false);
  const [savedBadgeVisible, setSavedBadgeVisible] = useState(false);

  const playLabel = isPaused ? "Resume" : "Play";

  const handleSpeechPlaybackChange = useCallback(
    (playing: boolean, paused: boolean) => {
      if (!audioUrl && !slide.audioPath) {
        setIsPlaying(playing);
        setIsPaused(paused);
      }
    },
    [audioUrl, slide.audioPath],
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
      setIsLoadingAudio(Boolean(slide.audioPath));
      setIsPlaying(false);
      setIsPaused(false);
      userStoppedRef.current = false;
    }, 0);

    async function loadAudio() {
      if (!slide.audioPath) {
        setAudioLoadFailed(false);
        setIsLoadingAudio(false);
        return;
      }

      const result = await desktopApi().getSlideAudioBytes(deck.id, slide.slideNumber);

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
  }, [deck.id, onMessage, slide.audioPath, slide.slideNumber]);

  useEffect(() => {
    if (!audioUrl) {
      setShowSavedBadge(false);
      setSavedBadgeVisible(false);
      return;
    }

    setShowSavedBadge(true);
    setSavedBadgeVisible(true);

    const fadeTimer = window.setTimeout(() => setSavedBadgeVisible(false), 3000);
    const hideTimer = window.setTimeout(() => setShowSavedBadge(false), 3500);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [audioUrl]);

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

    if (!audioUrl && !isLoadingAudio && slide.speechText.trim() && !slide.audioPath) {
      const timer = window.setTimeout(() => {
        speechRef.current?.play();
        setIsPlaying(true);
        setIsPaused(false);
      }, 250);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [audioUrl, autoplay, deck.id, isLoadingAudio, onMessage, slide.audioPath, slide.slideNumber, slide.speechText]);

  async function generateDeckAudio() {
    setIsGeneratingDeck(true);
    onMessage("Generating Piper audio for all slides...");

    try {
      const result = await desktopApi().generateDeckAudio(deck.id);

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

    if (slide.audioPath && !audioUrl) {
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

    if (!slide.audioPath) {
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
        text={slide.speechText}
        slideKey={`${deck.id}-${slide.slideNumber}`}
        rate={voiceRate}
        onError={(error) => onMessage(error, { isError: true })}
        onPlaybackChange={handleSpeechPlaybackChange}
        showControls={false}
      />

      {audioUrl ? (
        <audio
          ref={audioRef}
          key={audioUrl}
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
        disabled={!slide.speechText.trim() || isLoadingAudio}
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
      {showSavedBadge ? (
        <span
          className={`shrink-0 text-sm text-zinc-600 transition-opacity duration-500 ${
            savedBadgeVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          Saved audio
        </span>
      ) : null}
      {slide.ttsStatus === "error" && slide.ttsError ? (
        <span className="shrink-0 text-sm text-red-600">{slide.ttsError}</span>
      ) : null}
    </div>
  );
}

export function DesktopApp() {
  const resizeRef = useRef<HTMLDivElement | null>(null);
  const { message, isVisible, showMessage } = useAutoDismissMessage();
  const [isMounted, setIsMounted] = useState(false);
  const [view, setView] = useState<ViewMode>("library");
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [folders, setFolders] = useState<DeckFolder[]>([]);
  const [activeDeck, setActiveDeck] = useState<DeckManifest | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [newDeckTitle, setNewDeckTitle] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [editingDeckTitle, setEditingDeckTitle] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const [zoomScale, setZoomScale] = useState(1.35);

  const activeSlide = activeDeck?.slides[activeSlideIndex];

  const isElectron = isMounted && Boolean(window.slideTutor);

  const loadDecks = useCallback(async () => {
    if (!window.slideTutor) return;

    const result = await desktopApi().listDecks();

    if (result.ok) setDecks(result.data);
    else showMessage(result.error, { isError: true });
  }, []);

  const loadFolders = useCallback(async () => {
    if (!window.slideTutor) return;

    const result = await desktopApi().listFolders();

    if (result.ok) setFolders(result.data);
    else showMessage(result.error, { isError: true });
  }, []);

  const loadSettings = useCallback(async () => {
    if (!window.slideTutor) return;

    const result = await desktopApi().getSettings();

    if (result.ok) setSettings(result.data);
    else showMessage(result.error, { isError: true });
  }, []);

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

    setIsBusy(true);
    showMessage("Generating transcripts with Gemini...");

    try {
      const result = await desktopApi().generateTranscripts(activeDeck.id);

      if (!result.ok) throw new Error(result.error);

      setActiveDeck(result.data);
      setEditingDeckTitle(result.data.title);
      setActiveSlideIndex(0);
      showMessage("Transcripts generated. Review and edit before publishing.");
      await loadDecks();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not generate transcripts.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function reformatDeckMath() {
    if (!activeDeck) return;

    setIsBusy(true);
    showMessage("Reformatting math in all slides...");

    try {
      const result = await desktopApi().reformatDeckMath(activeDeck.id);

      if (!result.ok) throw new Error(result.error);

      setActiveDeck(result.data);
      showMessage("Math formatting updated for all slides.");
      await loadDecks();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not reformat math.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  async function importExternalTranscripts(slides: ImportedSlideInput[]) {
    if (!activeDeck) return;

    setIsBusy(true);
    showMessage("Importing external transcripts...");

    try {
      const result = await desktopApi().importExternalTranscripts(activeDeck.id, slides);

      if (!result.ok) throw new Error(result.error);

      setActiveDeck(result.data);
      setEditingDeckTitle(result.data.title);
      setActiveSlideIndex(0);
      showMessage(`Updated markdown and speech for ${slides.length} slides. Review and publish when ready.`);
      await loadDecks();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not import transcripts.", { isError: true });
    } finally {
      setIsBusy(false);
    }
  }

  function updateLocalSlide(update: Partial<SlideTranscript>) {
    if (!activeDeck || !activeSlide) return;

    setActiveDeck({
      ...activeDeck,
      slides: activeDeck.slides.map((slide) =>
        slide.slideNumber === activeSlide.slideNumber ? { ...slide, ...update } : slide,
      ),
    });
  }

  async function saveActiveSlide() {
    if (!activeDeck || !activeSlide) return;

    const update: SlideUpdate = {
      title: activeSlide.title,
      transcriptMarkdown: activeSlide.transcriptMarkdown,
      transcriptLatex: activeSlide.transcriptLatex,
      speechText: activeSlide.speechText,
      keyTerms: activeSlide.keyTerms,
    };

    setIsBusy(true);
    showMessage("");

    try {
      const result = await desktopApi().saveSlide(
        activeDeck.id,
        activeSlide.slideNumber,
        update,
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
    const total = activeDeck.slides.length || activeDeck.pageCount || 0;
    return total > 0 ? `Slide ${activeSlideIndex + 1} of ${total}` : "No scripts yet";
  }, [activeDeck, activeSlideIndex]);

  const viewerImmersive = useMemo(
    () => !settings.viewerShowTranscript && !settings.viewerShowSlideList,
    [settings.viewerShowSlideList, settings.viewerShowTranscript],
  );

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
    <main className="min-h-screen bg-background px-5 py-5 text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <h1 className="text-xl font-semibold">
            <span className="text-accent">Slide Tutor Desktop</span>
            <span className="mx-2 text-zinc-400">·</span>
            <span className="text-base font-normal text-zinc-600">Local PDF slide lessons</span>
          </h1>
          <nav className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setView("library")}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
            >
              <Library size={17} />
              Library
            </button>
            <button
              type="button"
              onClick={() => setView("settings")}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
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

            <section className="rounded-lg border border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line p-5">
                <h2 className="text-lg font-semibold">Local Library</h2>
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
              <div className="max-h-[720px] overflow-auto">
                {decks.length === 0 ? (
                  <p className="p-5 text-sm text-zinc-600">
                    No local decks yet. Import a PDF to start.
                  </p>
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
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <FileText className="shrink-0 text-accent" size={22} />
                                <div className="min-w-0">
                                  <h3 className="truncate font-semibold">{deck.title}</h3>
                                  <p className="text-sm text-zinc-600">
                                    {deck.slideCount} slides - {statusText(deck)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <select
                                  value={deck.folderId ?? ""}
                                  onChange={(event) =>
                                    assignFolder(deck.id, event.target.value || null)
                                  }
                                  className="h-10 rounded-md border border-line bg-white px-2 text-sm"
                                >
                                  <option value="">Unfiled</option>
                                  {folders.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
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
            </section>
          </section>
        ) : null}

        {view === "settings" ? (
          <section className="max-w-4xl rounded-lg border border-line bg-panel p-5">
            <h2 className="text-xl font-semibold">Settings</h2>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-medium">
                Gemini API key
                <input
                  value={settings.geminiApiKey}
                  onChange={(event) =>
                    setSettings({ ...settings, geminiApiKey: event.target.value })
                  }
                  type="password"
                  className="h-11 rounded-md border border-line bg-white px-3 outline-none focus:border-accent"
                />
              </label>
              <p className="text-sm text-zinc-600">
                Piper defaults to the bundled <code className="font-mono">piper/en_US-john-medium.onnx</code>{" "}
                voice. Leave paths blank to use it with <code className="font-mono">python -m piper</code> or an
                optional <code className="font-mono">piper.exe</code> in that folder.
              </p>
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
                    className="h-11 flex-1 rounded-md border border-line bg-white px-3 outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => choosePath("exe")}
                    className="h-11 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
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
                    className="h-11 flex-1 rounded-md border border-line bg-white px-3 outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => choosePath("voice")}
                    className="h-11 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                  >
                    Browse
                  </button>
                </div>
              </label>
              <button
                type="button"
                onClick={saveAppSettings}
                disabled={!isElectron || isBusy}
                className="inline-flex h-11 w-fit items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
              >
                <Save size={18} />
                Save Settings
              </button>
            </div>
          </section>
        ) : null}

        {view === "editor" && activeDeck ? (
          <section className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-line bg-panel">
              <div className="border-b border-line p-3 text-sm font-semibold">
                {statusText(activeDeck)}
              </div>
              <div className="max-h-[720px] overflow-auto">
                {activeDeck.slides.length === 0 ? (
                  <p className="p-4 text-sm text-zinc-600">
                    No transcripts yet. Generate with Gemini or import from an external LLM.
                  </p>
                ) : (
                  activeDeck.slides.map((item, index) => (
                    <button
                      key={item.slideNumber}
                      type="button"
                      onClick={() => setActiveSlideIndex(index)}
                      className={`block w-full border-b border-line px-3 py-3 text-left text-sm hover:bg-panel-muted ${
                        index === activeSlideIndex ? "bg-panel-muted font-semibold" : ""
                      }`}
                    >
                      Slide {item.slideNumber}
                      <span className="mt-1 block truncate text-zinc-600">
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
                      onClick={reformatDeckMath}
                      disabled={!activeDeck.slides.length || isBusy}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                    >
                      <RefreshCw size={17} />
                      Reformat math
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
                    <select
                      value={activeDeck.folderId ?? ""}
                      onChange={(event) =>
                        assignFolder(activeDeck.id, event.target.value || null)
                      }
                      className="h-9 rounded-md border border-line bg-white px-2 text-sm text-foreground"
                    >
                      <option value="">Unfiled</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <ExternalTranscriptImport
                deck={activeDeck}
                isBusy={isBusy}
                onImport={importExternalTranscripts}
                onMessage={showMessage}
              />

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)]">
                <PdfFromDeck
                  deckId={activeDeck.id}
                  pageNumber={activeSlide?.slideNumber ?? 1}
                  onClick={() => setZoomPage(activeSlide?.slideNumber ?? 1)}
                />
                {activeSlide ? (
                  <div className="rounded-lg border border-line bg-panel">
                    <div className="flex items-center justify-between border-b border-line p-4">
                      <h2 className="text-lg font-semibold">Review script</h2>
                      <button
                        type="button"
                        onClick={saveActiveSlide}
                        disabled={isBusy}
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-strong"
                      >
                        <Save size={17} />
                        Save
                      </button>
                    </div>
                    <div className="grid gap-4 p-4">
                      <label className="grid gap-2 text-sm font-medium">
                        Title
                        <input
                          value={activeSlide.title}
                          onChange={(event) =>
                            updateLocalSlide({ title: event.target.value })
                          }
                          className="h-10 rounded-md border border-line px-3 outline-none focus:border-accent"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Transcript Markdown with LaTeX
                        <textarea
                          value={activeSlide.transcriptMarkdown}
                          onChange={(event) =>
                            updateLocalSlide({
                              transcriptMarkdown: event.target.value,
                            })
                          }
                          className="min-h-[9rem] resize-y rounded-md border border-line bg-white px-3 py-2 caret-accent outline-none focus:border-accent"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Speech text
                        <textarea
                          value={activeSlide.speechText}
                          onChange={(event) =>
                            updateLocalSlide({ speechText: event.target.value })
                          }
                          rows={5}
                          className="min-h-[5rem] resize-y rounded-md border border-line bg-white px-3 py-2 caret-accent outline-none focus:border-accent"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Key terms, comma separated
                        <input
                          value={activeSlide.keyTerms.join(", ")}
                          onChange={(event) =>
                            updateLocalSlide({
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
                          markdown={activeSlide.transcriptMarkdown}
                          latex={activeSlide.transcriptLatex}
                          mathMode={settings.transcriptMathMode}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </section>
        ) : null}

        {view === "viewer" && activeDeck ? (
          <section className="flex h-[calc(100vh-110px)] min-h-0 flex-col gap-3">
            <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel p-4">
              <div>
                <h2 className="text-xl font-semibold">{activeDeck.title}</h2>
                <p className="text-sm text-zinc-600">
                  {slideCountLabel} - {folderName(folders, activeDeck.folderId)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateAutoSetting({
                      viewerShowSlideList: !settings.viewerShowSlideList,
                    })
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                >
                  <PanelLeft size={17} />
                  Slide list
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateAutoSetting({
                      viewerShowTranscript: !settings.viewerShowTranscript,
                    })
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                >
                  <FileText size={17} />
                  Transcript
                </button>
                <button
                  type="button"
                  onClick={() => setView("editor")}
                  className="h-10 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                >
                  Edit scripts
                </button>
              </div>
            </header>

            {activeSlide ? (
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
                      <aside className="min-h-0 overflow-auto rounded-lg border border-line bg-panel">
                        {activeDeck.slides.map((slide, index) => (
                          <button
                            key={slide.slideNumber}
                            type="button"
                            onClick={() => setActiveSlideIndex(index)}
                            className={`block w-full border-b border-line px-3 py-3 text-left text-sm hover:bg-panel-muted ${
                              index === activeSlideIndex
                                ? "bg-panel-muted font-semibold"
                                : ""
                            }`}
                          >
                            Slide {slide.slideNumber}
                            <span className="mt-1 block truncate text-zinc-600">
                              {slide.title}
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
                        <div className="min-h-0 min-w-0 overflow-auto pr-2">
                          <PdfFromDeck
                            deckId={activeDeck.id}
                            pageNumber={activeSlide.slideNumber}
                            onClick={() => setZoomPage(activeSlide.slideNumber)}
                          />
                        </div>
                        <button
                          type="button"
                          aria-label="Resize PDF and transcript panes"
                          onPointerDown={startResize}
                          className="h-full cursor-col-resize rounded-md bg-line hover:bg-accent"
                        />
                        <article className="ml-2 flex min-h-0 min-w-0 flex-col rounded-lg border border-line bg-panel">
                          <div className="shrink-0 border-b border-line p-4">
                            <p className="text-sm text-zinc-600">Transcript</p>
                            <h2 className="mt-1 text-xl font-semibold tracking-normal">
                              {activeSlide.title}
                            </h2>
                          </div>
                          <div className="min-h-0 flex-1 overflow-auto p-5">
                            <MarkdownTranscript
                              markdown={activeSlide.transcriptMarkdown}
                              latex={activeSlide.transcriptLatex}
                              mathMode={settings.transcriptMathMode}
                            />
                          </div>
                        </article>
                      </div>
                    ) : (
                      <div
                        className={
                          viewerImmersive
                            ? "flex h-full min-h-0 items-center justify-center"
                            : "min-h-0 overflow-auto"
                        }
                      >
                        <PdfFromDeck
                          deckId={activeDeck.id}
                          pageNumber={activeSlide.slideNumber}
                          fitMode={viewerImmersive ? "contain" : "width"}
                          className={viewerImmersive ? "h-full w-full" : ""}
                          onClick={() => setZoomPage(activeSlide.slideNumber)}
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
                          Math.min(activeDeck.slides.length - 1, current + 1),
                        )
                      }
                      disabled={activeSlideIndex >= activeDeck.slides.length - 1}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
                    >
                      Next
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <p className="rounded-lg border border-line bg-panel p-5 text-sm text-zinc-600">
                This deck has no generated slide transcripts yet.
              </p>
            )}
          </section>
        ) : null}

        {zoomPage && activeDeck ? (
          <div className="fixed inset-0 z-50 grid bg-black/70 p-5">
            <div className="grid min-h-0 rounded-lg bg-background">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel p-3">
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
                    onClick={() => setZoomScale(1.35)}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold hover:bg-panel-muted"
                  >
                    <RotateCcw size={16} />
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomPage(null)}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-strong"
                  >
                    <X size={16} />
                    Close
                  </button>
                </div>
              </div>
              <div className="min-h-0 overflow-auto p-4">
                <PdfFromDeck
                  deckId={activeDeck.id}
                  pageNumber={zoomPage}
                  scaleMultiplier={zoomScale}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
