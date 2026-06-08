"use client";

import { Pause, Play, Square } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

export type SpeechControlsHandle = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  isSpeaking: () => boolean;
};

type SpeechControlsProps = {
  text: string;
  slideKey: string;
  rate: number;
  onError?: (message: string) => void;
  onPlaybackChange?: (playing: boolean, paused: boolean) => void;
  showControls?: boolean;
};

function pickPreferredVoice(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;

  return (
    pool.find((voice) => /microsoft|natural|zira|david|aria/i.test(voice.name)) ??
    pool.find((voice) => voice.default) ??
    pool[0] ??
    null
  );
}

function waitForSpeechIdle(timeoutMs = 500) {
  return new Promise<void>((resolve) => {
    const started = Date.now();

    const check = () => {
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        resolve();
        return;
      }

      if (Date.now() - started >= timeoutMs) {
        resolve();
        return;
      }

      window.setTimeout(check, 30);
    };

    check();
  });
}

export const SpeechControls = forwardRef<SpeechControlsHandle, SpeechControlsProps>(
  function SpeechControls(
    { text, slideKey, rate, onError, onPlaybackChange, showControls = true },
    ref,
  ) {
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const speakTimerRef = useRef<number | null>(null);
    const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
    const onPlaybackChangeRef = useRef(onPlaybackChange);

    useEffect(() => {
      onPlaybackChangeRef.current = onPlaybackChange;
    }, [onPlaybackChange]);
    const [isSupported, setIsSupported] = useState(false);
    const [voicesReady, setVoicesReady] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const canSpeak = useMemo(() => text.trim().length > 0, [text]);

    useEffect(() => {
      const timer = window.setTimeout(() => {
        const supported = "speechSynthesis" in window;
        setIsSupported(supported);
        if (!supported) return;

        const markReady = () => {
          const voices = window.speechSynthesis.getVoices();
          preferredVoiceRef.current = pickPreferredVoice(voices);
          setVoicesReady(voices.length > 0);
        };

        if (window.speechSynthesis.getVoices().length > 0) {
          markReady();
        } else {
          window.speechSynthesis.addEventListener("voiceschanged", markReady, {
            once: true,
          });
          window.setTimeout(markReady, 1500);
        }
      }, 0);

      return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        if (speakTimerRef.current) {
          window.clearTimeout(speakTimerRef.current);
          speakTimerRef.current = null;
        }

        window.speechSynthesis.cancel();
        utteranceRef.current = null;
        const timer = window.setTimeout(() => {
          setIsSpeaking(false);
          setIsPaused(false);
          onPlaybackChangeRef.current?.(false, false);
        }, 0);

        return () => window.clearTimeout(timer);
      }

      return undefined;
    }, [slideKey]);

    useEffect(() => {
      if (!isSpeaking || isPaused || !utteranceRef.current) return;

      if (speakTimerRef.current) {
        window.clearTimeout(speakTimerRef.current);
      }

      speakTimerRef.current = window.setTimeout(() => {
        void speakFresh();
      }, 120);

      return () => {
        if (speakTimerRef.current) {
          window.clearTimeout(speakTimerRef.current);
          speakTimerRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rate]);

    async function speakFresh() {
      if (!canSpeak || !voicesReady) return;

      await waitForSpeechIdle();
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = 1;
      if (preferredVoiceRef.current) {
        utterance.voice = preferredVoiceRef.current;
      }

      utteranceRef.current = utterance;
      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
        onPlaybackChangeRef.current?.(false, false);
      };
      utterance.onerror = (event) => {
        if (event.error === "interrupted" || event.error === "canceled") {
          setIsSpeaking(false);
          setIsPaused(false);
          utteranceRef.current = null;
          onPlaybackChangeRef.current?.(false, false);
          return;
        }

        const message = event.error ? `Speech error: ${event.error}` : "Speech playback failed.";
        setErrorMessage(message);
        onError?.(message);
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
        onPlaybackChangeRef.current?.(false, false);
      };

      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
      setIsPaused(false);
      setErrorMessage("");
      onPlaybackChangeRef.current?.(true, false);
    }

    async function play() {
      if (!canSpeak || !voicesReady) return;

      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
        setIsSpeaking(true);
        onPlaybackChangeRef.current?.(true, false);
        return;
      }

      if (speakTimerRef.current) {
        window.clearTimeout(speakTimerRef.current);
      }

      speakTimerRef.current = window.setTimeout(() => {
        void speakFresh();
      }, 120);
    }

    function pause() {
      window.speechSynthesis.pause();
      setIsPaused(true);
      onPlaybackChangeRef.current?.(true, true);
    }

    function stop() {
      if (speakTimerRef.current) {
        window.clearTimeout(speakTimerRef.current);
        speakTimerRef.current = null;
      }

      window.speechSynthesis.cancel();
      utteranceRef.current = null;
      setIsSpeaking(false);
      setIsPaused(false);
      onPlaybackChangeRef.current?.(false, false);
    }

    useImperativeHandle(ref, () => ({
      play,
      pause,
      stop,
      isSpeaking: () => isSpeaking,
    }));

    if (!isSupported) {
      return (
        <p className="rounded-md border border-line bg-panel-muted px-3 py-2 text-sm text-zinc-600">
          Browser text-to-speech is not available on this device.
        </p>
      );
    }

    if (!showControls) {
      return errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null;
    }

    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void play()}
            disabled={!canSpeak || !voicesReady}
            aria-label={voicesReady ? (isPaused ? "Resume" : "Play") : "Loading voices"}
            title={voicesReady ? (isPaused ? "Resume" : "Play") : "Loading voices"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent text-white hover:bg-accent-strong"
          >
            <Play size={17} />
          </button>
          <button
            type="button"
            onClick={pause}
            disabled={!isSpeaking || isPaused}
            aria-label="Pause"
            title="Pause"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-panel hover:bg-panel-muted"
          >
            <Pause size={17} />
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={!isSpeaking && !isPaused}
            aria-label="Stop"
            title="Stop"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-panel hover:bg-panel-muted"
          >
            <Square size={17} />
          </button>
        </div>
        {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
      </div>
    );
  },
);
