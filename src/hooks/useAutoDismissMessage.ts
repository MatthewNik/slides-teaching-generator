"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ShowMessageOptions = {
  durationMs?: number;
  isError?: boolean;
};

const DEFAULT_SUCCESS_MS = 4000;
const DEFAULT_ERROR_MS = 8000;
const FADE_MS = 500;

export function useAutoDismissMessage() {
  const [message, setMessage] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  const showMessage = useCallback(
    (text: string, options: ShowMessageOptions = {}) => {
      clearTimers();

      if (!text.trim()) {
        setIsVisible(false);
        setMessage("");
        return;
      }

      const durationMs = options.durationMs ?? (options.isError ? DEFAULT_ERROR_MS : DEFAULT_SUCCESS_MS);

      setMessage(text);
      setIsVisible(true);

      dismissTimerRef.current = window.setTimeout(() => {
        setIsVisible(false);
        fadeTimerRef.current = window.setTimeout(() => {
          setMessage("");
        }, FADE_MS);
      }, durationMs);
    },
    [clearTimers],
  );

  useEffect(() => clearTimers, [clearTimers]);

  return { message, isVisible, showMessage, clearMessage: () => showMessage("") };
}
