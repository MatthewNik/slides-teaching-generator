import { normalizeMathFragments } from "./mathNormalize";

export const SLIDE_DELIMITER = ",,,,,,,,,";
export const SLIDE_DELIMITER_PATTERN = /\n\s*,{9,11}\s*\n/;
export const SLIDE_HEADER_PATTERN = /^={3,}\s*SLIDE\s+(\d+)\s*={3,}\s*$/gm;

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

function hasCommaDelimiter(text: string) {
  return SLIDE_DELIMITER_PATTERN.test(text);
}

function hasSlideHeaders(text: string) {
  return /^={3,}\s*SLIDE\s+\d+\s*={3,}\s*$/im.test(text);
}

function stripTrailingCommaDelimiter(block: string) {
  return block.replace(/\n\s*,{9,11}\s*$/, "").trim();
}

function splitByCommaDelimiter(trimmed: string) {
  return trimmed
    .split(SLIDE_DELIMITER_PATTERN)
    .map((block) => stripTrailingCommaDelimiter(block))
    .filter(Boolean);
}

function splitBySlideHeaders(trimmed: string) {
  const matches = [...trimmed.matchAll(SLIDE_HEADER_PATTERN)];

  if (matches.length === 0) {
    return [] as Array<{ slideNumber: number; block: string }>;
  }

  return matches.map((match, index) => {
    const slideNumber = Number.parseInt(match[1] ?? "", 10);
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index! : trimmed.length;
    const block = stripTrailingCommaDelimiter(trimmed.slice(start, end));

    return { slideNumber, block };
  });
}

function findSlideBlocks(trimmed: string) {
  if (hasCommaDelimiter(trimmed)) {
    const blocks = splitByCommaDelimiter(trimmed);

    if (blocks.length > 1) {
      return blocks.map((block, index) => ({
        slideNumber: index + 1,
        block,
      }));
    }
  }

  const headerBlocks = splitBySlideHeaders(trimmed);

  if (headerBlocks.length > 0) {
    return headerBlocks;
  }

  if (hasCommaDelimiter(trimmed)) {
    const blocks = splitByCommaDelimiter(trimmed);

    if (blocks.length === 1) {
      return [{ slideNumber: 1, block: blocks[0]! }];
    }
  }

  return [];
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

function parseBlock(block: string, slideNumber: number) {
  const trimmed = block.trim();
  if (!trimmed) {
    return { error: `Slide ${slideNumber} is empty.` };
  }

  const markdownMarker = "---MARKDOWN---";
  const speechMarker = "---SPEECH---";

  const markdownIndex = trimmed.indexOf(markdownMarker);
  const speechIndex = trimmed.indexOf(speechMarker);

  if (markdownIndex === -1) {
    return { error: `Slide ${slideNumber} is missing ${markdownMarker}.` };
  }

  if (speechIndex === -1) {
    return { error: `Slide ${slideNumber} is missing ${speechMarker}.` };
  }

  if (speechIndex <= markdownIndex) {
    return { error: `Slide ${slideNumber} has ${speechMarker} before ${markdownMarker}.` };
  }

  const preamble = trimmed.slice(0, markdownIndex).trim();
  const transcriptMarkdown = trimmed
    .slice(markdownIndex + markdownMarker.length, speechIndex)
    .trim();
  const speechText = trimmed.slice(speechIndex + speechMarker.length).trim();

  if (!transcriptMarkdown) {
    return { error: `Slide ${slideNumber} has empty markdown content.` };
  }

  if (!speechText) {
    return { error: `Slide ${slideNumber} has empty speech content.` };
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
): ParseImportResult {
  const trimmed = rawText.trim();
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!trimmed) {
    return { slides: [], warnings, errors: ["Paste the full ChatGPT response first."] };
  }

  if (!hasCommaDelimiter(trimmed) && !hasSlideHeaders(trimmed)) {
    errors.push(
      `Could not find slide separators. Put 9-10 commas on their own line between slides (${SLIDE_DELIMITER}), or use ========== SLIDE N ========== headers.`,
    );
    return { slides: [], warnings, errors };
  }

  const blocks = findSlideBlocks(trimmed);

  if (blocks.length === 0) {
    return { slides: [], warnings, errors: ["No slide blocks were found in the pasted text."] };
  }

  const slides: ImportedSlideParsed[] = [];

  blocks.forEach(({ block, slideNumber }) => {
    const result = parseBlock(block, slideNumber);

    if ("error" in result) {
      errors.push(result.error);
      return;
    }

    slides.push(result.slide);
  });

  if (errors.length > 0) {
    return { slides: [], warnings, errors };
  }

  slides.sort((a, b) => a.slideNumber - b.slideNumber);

  for (let index = 0; index < slides.length; index += 1) {
    const expectedNumber = index + 1;
    if (slides[index]?.slideNumber !== expectedNumber) {
      errors.push(
        `Slide numbers must be sequential starting at 1. Expected slide ${expectedNumber}, found slide ${slides[index]?.slideNumber}.`,
      );
      break;
    }
  }

  if (errors.length > 0) {
    return { slides: [], warnings, errors };
  }

  if (expectedSlideCount && expectedSlideCount > 0 && slides.length !== expectedSlideCount) {
    errors.push(
      `Imported ${slides.length} slides, but this deck expects ${expectedSlideCount}. Check delimiters and paste the full response.`,
    );
    return { slides: [], warnings, errors };
  }

  return { slides, warnings, errors };
}
