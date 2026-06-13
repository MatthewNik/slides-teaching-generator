import { normalizeMathFragments } from "./mathNormalize";
import type { TranscriptGenerationOptions } from "./types";

export const SLIDE_DELIMITER = ",,,,,,,,,";
export const SLIDE_DELIMITER_PATTERN = /\n\s*,{9,11}\s*\n/;
export const SLIDE_HEADER_PATTERN = /^={3,}\s*SLIDE\s+(\d+)\s*={3,}\s*$/gm;
export const SLIDE_MARKER_PATTERN = /^<<<SLIDE\s+(\d{1,4})\s+(START|END)>>>$/i;

export type ImportedSlideParsed = {
  slideNumber: number;
  title: string;
  transcriptMarkdown: string;
  transcriptLatex: string;
  speechText: string;
  keyTerms: string[];
  generationStatus: "reviewed";
};

export type ParseImportResult = {
  slides: ImportedSlideParsed[];
  warnings: string[];
  errors: string[];
};

type SlideBlock = { slideNumber: number; block: string };

function padSlideNumber(slideNumber: number) {
  return String(slideNumber).padStart(3, "0");
}

export function slideStartMarker(slideNumber: number) {
  return `<<<SLIDE ${padSlideNumber(slideNumber)} START>>>`;
}

export function slideEndMarker(slideNumber: number) {
  return `<<<SLIDE ${padSlideNumber(slideNumber)} END>>>`;
}

function hasCommaDelimiter(text: string) {
  return SLIDE_DELIMITER_PATTERN.test(text);
}

function hasSlideHeaders(text: string) {
  return /^={3,}\s*SLIDE\s+\d+\s*={3,}\s*$/im.test(text);
}

function hasPairedMarkers(text: string) {
  return /^<<<SLIDE\s+\d{1,4}\s+(START|END)>>>$/im.test(text);
}

function normalizePastedImportText(rawText: string) {
  let text = rawText
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  const fencedMatch = text.match(/^```(?:text|txt|plain|markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  if (fencedMatch?.[1]) {
    text = fencedMatch[1].trim();
  }

  return text;
}

function stripTrailingCommaDelimiter(block: string) {
  return block.replace(/\n\s*,{9,11}\s*$/, "").trim();
}

function splitByCommaDelimiter(trimmed: string): SlideBlock[] {
  return trimmed
    .split(SLIDE_DELIMITER_PATTERN)
    .map((block) => stripTrailingCommaDelimiter(block))
    .filter(Boolean)
    .map((block, index) => ({
      slideNumber: index + 1,
      block,
    }));
}

function splitBySlideHeaders(trimmed: string): SlideBlock[] {
  const matches = [...trimmed.matchAll(SLIDE_HEADER_PATTERN)];

  if (matches.length === 0) {
    return [];
  }

  return matches.map((match, index) => {
    const slideNumber = Number.parseInt(match[1] ?? "", 10);
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index! : trimmed.length;
    const block = stripTrailingCommaDelimiter(trimmed.slice(start, end));

    return { slideNumber, block };
  });
}

function splitByPairedMarkers(trimmed: string) {
  const blocks: SlideBlock[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<number>();
  let current: { slideNumber: number; lines: string[] } | null = null;
  let outsideText = "";

  const lines = trimmed.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const marker = line.trim().match(SLIDE_MARKER_PATTERN);

    if (!marker) {
      if (current) {
        current.lines.push(line);
      } else if (line.trim()) {
        outsideText += `${outsideText ? "\n" : ""}${line}`;
      }
      continue;
    }

    const slideNumber = Number.parseInt(marker[1] ?? "", 10);
    const kind = marker[2]?.toUpperCase();

    if (kind === "START") {
      if (current) {
        errors.push(
          `Slide ${current.slideNumber} is missing ${slideEndMarker(current.slideNumber)} before line ${index + 1}.`,
        );
      }

      if (seen.has(slideNumber) || blocks.some((block) => block.slideNumber === slideNumber)) {
        errors.push(`Slide ${slideNumber} appears more than once.`);
      }

      seen.add(slideNumber);
      current = { slideNumber, lines: [] };
      continue;
    }

    if (!current) {
      errors.push(`${slideEndMarker(slideNumber)} appears before its start marker.`);
      continue;
    }

    if (slideNumber !== current.slideNumber) {
      errors.push(
        `Slide ${current.slideNumber} starts but closes with ${slideEndMarker(slideNumber)}.`,
      );
      current = null;
      continue;
    }

    const block = current.lines.join("\n").trim();
    if (!block) {
      errors.push(`Slide ${slideNumber} is empty between its start and end markers.`);
    } else {
      blocks.push({ slideNumber, block });
    }

    current = null;
  }

  if (current) {
    errors.push(`Slide ${current.slideNumber} is missing ${slideEndMarker(current.slideNumber)}.`);
  }

  if (outsideText.trim()) {
    warnings.push("Ignored text outside the paired slide markers.");
  }

  return { blocks, errors, warnings };
}

function findSlideBlocks(trimmed: string) {
  if (hasPairedMarkers(trimmed)) {
    const result = splitByPairedMarkers(trimmed);
    return { ...result, source: "paired" as const };
  }

  if (hasSlideHeaders(trimmed)) {
    return {
      blocks: splitBySlideHeaders(trimmed),
      errors: [] as string[],
      warnings: ["Imported a legacy slide-header response. Paired slide markers are preferred."],
      source: "headers" as const,
    };
  }

  if (hasCommaDelimiter(trimmed)) {
    return {
      blocks: splitByCommaDelimiter(trimmed),
      errors: [] as string[],
      warnings: ["Imported a legacy comma-delimited response. Paired slide markers are preferred."],
      source: "commas" as const,
    };
  }

  return {
    blocks: [] as SlideBlock[],
    errors: [
      `Could not find slide markers. Use ${slideStartMarker(1)} and ${slideEndMarker(1)} around each slide block.`,
    ],
    warnings: [] as string[],
    source: "none" as const,
  };
}

function extractTitle(block: string, slideNumber: number) {
  const titleMatch = block.match(/^TITLE:\s*(.+)$/im);
  if (titleMatch?.[1]?.trim()) {
    return titleMatch[1].trim();
  }

  const headerMatch = block.match(/^={3,}\s*SLIDE\s+\d+\s*={3,}\s*$/im);
  if (headerMatch) {
    const afterHeader = block.slice(headerMatch.index! + headerMatch[0].length).trim();
    const firstLine = afterHeader.split("\n").find((line) => line.trim())?.trim();
    if (firstLine && !firstLine.startsWith("---")) {
      return firstLine;
    }
  }

  return `Slide ${slideNumber}`;
}

type ParseBlockResult = { error: string } | { slide: ImportedSlideParsed };

function parseBlock(
  block: string,
  slideNumber: number,
  options: TranscriptGenerationOptions,
): ParseBlockResult {
  const trimmed = block.trim();
  if (!trimmed) {
    return { error: `Slide ${slideNumber} is empty.` };
  }

  const markdownMarker = "---MARKDOWN---";
  const speechMarker = "---SPEECH---";

  const markdownIndex = trimmed.indexOf(markdownMarker);
  const speechIndex = trimmed.indexOf(speechMarker);
  const markdownMarkerCount = trimmed.split(markdownMarker).length - 1;
  const speechMarkerCount = trimmed.split(speechMarker).length - 1;

  if (markdownIndex === -1) {
    return { error: `Slide ${slideNumber} is missing ${markdownMarker}.` };
  }

  if (markdownMarkerCount > 1) {
    return { error: `Slide ${slideNumber} has more than one ${markdownMarker}.` };
  }

  if (speechMarkerCount > 1) {
    return { error: `Slide ${slideNumber} has more than one ${speechMarker}.` };
  }

  if (options.includeSpeech && speechIndex === -1) {
    return { error: `Slide ${slideNumber} is missing ${speechMarker}.` };
  }

  if (speechIndex !== -1 && speechIndex <= markdownIndex) {
    return { error: `Slide ${slideNumber} has ${speechMarker} before ${markdownMarker}.` };
  }

  const preamble = trimmed.slice(0, markdownIndex).trim();
  const transcriptMarkdown = trimmed
    .slice(
      markdownIndex + markdownMarker.length,
      speechIndex === -1 ? trimmed.length : speechIndex,
    )
    .trim();
  const speechText = options.includeSpeech
    ? trimmed.slice(speechIndex + speechMarker.length).trim()
    : "";

  if (!transcriptMarkdown) {
    return { error: `Slide ${slideNumber} has empty markdown content.` };
  }

  if (options.includeSpeech && !speechText) {
    return { error: `Slide ${slideNumber} has empty speech content.` };
  }

  if (/<<<SLIDE\s+\d{1,4}\s+(START|END)>>>/i.test(transcriptMarkdown)) {
    return { error: `Slide ${slideNumber} contains another slide marker inside its markdown.` };
  }

  const title = extractTitle(preamble || trimmed, slideNumber);
  const normalizedMarkdown = normalizeMathFragments(transcriptMarkdown);

  return {
    slide: {
      slideNumber,
      title,
      transcriptMarkdown: normalizedMarkdown,
      transcriptLatex: normalizedMarkdown,
      speechText,
      keyTerms: [] as string[],
      generationStatus: "reviewed" as const,
    },
  };
}

export function parseExternalTranscriptImport(
  rawText: string,
  expectedSlideCount?: number,
  options: TranscriptGenerationOptions = { includeSpeech: false },
): ParseImportResult {
  const trimmed = normalizePastedImportText(rawText);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!trimmed) {
    return { slides: [], warnings, errors: ["Paste the full LLM response first."] };
  }

  const found = findSlideBlocks(trimmed);
  warnings.push(...found.warnings);
  errors.push(...found.errors);

  if (errors.length > 0) {
    return { slides: [], warnings, errors };
  }

  if (found.blocks.length === 0) {
    return { slides: [], warnings, errors: ["No slide blocks were found in the pasted text."] };
  }

  const slides: ImportedSlideParsed[] = [];

  found.blocks.forEach(({ block, slideNumber }) => {
    const result = parseBlock(block, slideNumber, options);

    if ("error" in result) {
      errors.push(result.error);
      return;
    }

    slides.push(result.slide);
  });

  if (errors.length > 0) {
    return { slides: [], warnings, errors };
  }

  for (let index = 0; index < slides.length; index += 1) {
    const expectedNumber = index + 1;
    if (slides[index]?.slideNumber !== expectedNumber) {
      errors.push(
        `Slide numbers must be sequential and in order starting at 1. Expected slide ${expectedNumber}, found slide ${slides[index]?.slideNumber}.`,
      );
      break;
    }
  }

  if (errors.length > 0) {
    return { slides: [], warnings, errors };
  }

  if (expectedSlideCount && expectedSlideCount > 0 && slides.length !== expectedSlideCount) {
    errors.push(
      `Imported ${slides.length} slides, but this deck expects ${expectedSlideCount}. Check markers and paste the full response.`,
    );
    return { slides: [], warnings, errors };
  }

  return { slides, warnings, errors };
}
