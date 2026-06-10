"use client";

import { useEffect, useRef, useState } from "react";

type PdfSlideProps = {
  pdfUrl: string;
  pageNumber: number;
  onPageCount?: (pageCount: number) => void;
  scaleMultiplier?: number;
  fitMode?: "width" | "contain";
  className?: string;
  onClick?: () => void;
};

type PdfDocumentHandle = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: {
      canvas: HTMLCanvasElement;
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void> };
  }>;
};

const pdfDocumentCache = new Map<string, Promise<PdfDocumentHandle>>();

async function loadPdfDocument(pdfUrl: string) {
  const cached = pdfDocumentCache.get(pdfUrl);
  if (cached) return cached;

  const promise = (async () => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs.getDocument({ url: pdfUrl }).promise as unknown as Promise<PdfDocumentHandle>;
  })();

  pdfDocumentCache.set(pdfUrl, promise);
  return promise;
}

export function PdfSlide({
  pdfUrl,
  pageNumber,
  onPageCount,
  scaleMultiplier = 1,
  fitMode = "width",
  className = "",
  onClick,
}: PdfSlideProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });
  const loadedPageKeyRef = useRef("");
  const [error, setError] = useState("");
  const [showInitialSpinner, setShowInitialSpinner] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    let resizeTimer: number | undefined;
    const pageKey = `${pdfUrl}:${pageNumber}:${scaleMultiplier}:${fitMode}`;
    const isNewPage = loadedPageKeyRef.current !== pageKey;
    loadedPageKeyRef.current = pageKey;

    async function renderPage(showSpinner: boolean) {
      if (showSpinner) {
        setShowInitialSpinner(true);
      }
      setError("");

      try {
        const pdfDoc = await loadPdfDocument(pdfUrl);
        if (cancelled) return;

        onPageCount?.(pdfDoc.numPages);

        const page = await pdfDoc.getPage(Math.min(pageNumber, pdfDoc.numPages));
        const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth;
        const containerHeight = containerRef.current?.clientHeight ?? window.innerHeight;

        const widthChanged = Math.abs(containerWidth - lastSizeRef.current.width) >= 8;
        const heightChanged = Math.abs(containerHeight - lastSizeRef.current.height) >= 8;

        if (!widthChanged && !heightChanged && !showSpinner) {
          return;
        }

        lastSizeRef.current = { width: containerWidth, height: containerHeight };

        const pixelRatio = window.devicePixelRatio || 1;
        const baseViewport = page.getViewport({ scale: 1 });
        const widthScale = containerWidth / baseViewport.width;
        const heightScale =
          fitMode === "contain" && containerHeight > 0
            ? containerHeight / baseViewport.height
            : widthScale;
        const fitScale = Math.min(
          4,
          Math.max(0.6, fitMode === "contain" ? Math.min(widthScale, heightScale) : widthScale),
        );
        const renderScale = fitScale * scaleMultiplier * pixelRatio;
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = canvasRef.current;

        if (!canvas || cancelled) return;

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is not available.");

        const offscreen = window.document.createElement("canvas");
        offscreen.width = Math.floor(viewport.width);
        offscreen.height = Math.floor(viewport.height);
        const offscreenContext = offscreen.getContext("2d");
        if (!offscreenContext) throw new Error("Canvas rendering is not available.");

        await page.render({
          canvas: offscreen,
          canvasContext: offscreenContext,
          viewport,
        }).promise;

        if (cancelled) return;

        const displayWidth = Math.floor(viewport.width / pixelRatio);
        const displayHeight = Math.floor(viewport.height / pixelRatio);

        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        context.drawImage(offscreen, 0, 0);

        if (!cancelled) {
          setShowInitialSpinner(false);
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(
            renderError instanceof Error
              ? renderError.message
              : "Could not render this PDF page.",
          );
          setShowInitialSpinner(false);
        }
      }
    }

    if (isNewPage) {
      lastSizeRef.current = { width: 0, height: 0 };
    }

    void renderPage(isNewPage);

    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          void renderPage(false);
        }, 200);
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      cancelled = true;
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
    };
  }, [fitMode, onPageCount, pageNumber, pdfUrl, scaleMultiplier]);

  const containerClassName =
    fitMode === "contain"
      ? `relative flex h-full min-h-0 items-center justify-center overflow-visible rounded-lg border border-line bg-white ${className}`.trim()
      : `relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-lg border border-line bg-white ${className}`.trim();

  return (
    <div ref={containerRef} className={containerClassName} onClick={onClick}>
      {showInitialSpinner ? (
        <div className="absolute inset-x-0 top-0 z-10 bg-panel-muted/90 px-4 py-2 text-sm text-zinc-600">
          Rendering slide...
        </div>
      ) : null}
      {error ? (
        <div className="p-5 text-sm text-danger">{error}</div>
      ) : (
        <canvas
          ref={canvasRef}
          className="block shrink-0 transition-opacity duration-150"
          style={{ opacity: showInitialSpinner ? 0.72 : 1 }}
        />
      )}
    </div>
  );
}
