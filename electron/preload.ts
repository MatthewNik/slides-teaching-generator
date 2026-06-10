import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AppSettings } from "../src/lib/types";
import type { TranscriptMode } from "../src/lib/transcriptModes";
import type {
  ImportedSlideInput,
  SlideUpdate,
  SlideTutorDesktopApi,
} from "../src/types/electron";

const api: SlideTutorDesktopApi = {
  listDecks: () => ipcRenderer.invoke("decks:list"),
  choosePdfAndCreateDeck: (title: string) =>
    ipcRenderer.invoke("decks:choose-pdf-create", title),
  createDeckFromPdfPath: (sourcePath: string, title: string) =>
    ipcRenderer.invoke("decks:create-from-pdf-path", sourcePath, title),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getDeck: (deckId: string) => ipcRenderer.invoke("decks:get", deckId),
  generateTranscripts: (deckId: string, mode: TranscriptMode) =>
    ipcRenderer.invoke("decks:generate-transcripts", deckId, mode),
  saveSlide: (
    deckId: string,
    slideNumber: number,
    update: SlideUpdate,
    mode: TranscriptMode,
  ) => ipcRenderer.invoke("decks:save-slide", deckId, slideNumber, update, mode),
  publishDeck: (deckId: string) => ipcRenderer.invoke("decks:publish", deckId),
  reformatDeckMath: (deckId: string) => ipcRenderer.invoke("decks:reformat-math", deckId),
  importExternalTranscripts: (deckId: string, slides: ImportedSlideInput[]) =>
    ipcRenderer.invoke("decks:import-external-transcripts", deckId, slides),
  renameDeck: (deckId: string, title: string) =>
    ipcRenderer.invoke("decks:rename", deckId, title),
  deleteDeck: (deckId: string) => ipcRenderer.invoke("decks:delete", deckId),
  listFolders: () => ipcRenderer.invoke("folders:list"),
  createFolder: (name: string) => ipcRenderer.invoke("folders:create", name),
  assignDeckFolder: (deckId: string, folderId: string | null) =>
    ipcRenderer.invoke("decks:assign-folder", deckId, folderId),
  getPdfBytes: (deckId: string) => ipcRenderer.invoke("decks:get-pdf-bytes", deckId),
  generateSlideAudio: (deckId: string, slideNumber: number, mode: TranscriptMode) =>
    ipcRenderer.invoke("tts:generate-slide-audio", deckId, slideNumber, mode),
  generateDeckAudio: (deckId: string, mode: TranscriptMode) =>
    ipcRenderer.invoke("tts:generate-deck-audio", deckId, mode),
  getSlideAudioBytes: (deckId: string, slideNumber: number, mode: TranscriptMode) =>
    ipcRenderer.invoke("tts:get-slide-audio-bytes", deckId, slideNumber, mode),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("settings:save", settings),
  choosePiperExecutable: () => ipcRenderer.invoke("settings:choose-piper-exe"),
  choosePiperVoiceModel: () => ipcRenderer.invoke("settings:choose-piper-voice"),
};

contextBridge.exposeInMainWorld("slideTutor", api);
