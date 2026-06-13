import { slideEndMarker, slideStartMarker } from "./importTranscripts";
import {
  TRANSCRIPT_MODE_PRESETS,
  type TranscriptMode,
} from "./transcriptModes";
import type { DeckManifest, TranscriptGenerationOptions } from "./types";

function expectedSlideCountLabel(deck: DeckManifest) {
  const count = deck.slides.length || deck.pageCount;
  return count && count > 0 ? String(count) : "the same number of pages as the attached PDF";
}

function speechRules(includeSpeech: boolean) {
  if (!includeSpeech) {
    return `- Do not include a ---SPEECH--- section.
- Do not write any text-to-speech narration. Only create the Markdown teaching transcript.`;
  }

  return `- Put plain spoken narration in the ---SPEECH--- section. Do not use raw LaTeX in speech text. Verbalize equations naturally.`;
}

function exampleSlideBlock(slideNumber: number, includeSpeech: boolean) {
  const start = slideStartMarker(slideNumber);
  const end = slideEndMarker(slideNumber);
  const speechSection = includeSpeech
    ? `
---SPEECH---
Plain narration with no LaTeX, for example: This slide introduces the main idea and explains why it matters before the next slide adds detail.
`
    : "";

  return `${start}
TITLE: Short teaching title for slide ${slideNumber}

---MARKDOWN---
Teacher-facing slide overview in Markdown, for example: This slide introduces the main idea and explains why it matters before the next slide adds detail.
${speechSection}
${end}`;
}

export function buildExternalLlmPrompt(
  deck: DeckManifest,
  mode: TranscriptMode,
  options: TranscriptGenerationOptions = { includeSpeech: false },
) {
  const slideCount = expectedSlideCountLabel(deck);
  const preset = TRANSCRIPT_MODE_PRESETS[mode];
  const promptVariant = options.includeSpeech ? "withSpeech" : "withoutSpeech";

  return `You are creating teaching notes for a PDF slide deck named "${deck.title}".

Attach or upload the same PDF slide deck with this prompt before you respond.

Create exactly ${slideCount} slide blocks, one per PDF page, in page order.

For each slide, explain what is visible on that page for a student learning without a live instructor.

Transcript style: ${preset.label}.
${preset.externalPromptInstructions[promptVariant]}

Output rules:
- Return the entire response inside one plain-text code block using triple backticks. Do not put commentary before or after the code block.
- Use the exact paired slide markers shown below.
- Every slide block must start with ${slideStartMarker(1).replace("001", "NNN")} and end with ${slideEndMarker(1).replace("001", "NNN")}, where NNN is the zero-padded 1-based slide number.
- Inside the code block, do not put any text outside the paired slide markers.
- Put the slide overview in the ---MARKDOWN--- section.
- Focus on what the slide is about, the intuition, and the takeaway. Do not derive formulas or copy long equations.
- Mention formulas only briefly when they are central to the slide.
- If a short formula is truly needed, put it on its own line inside $$ ... $$ with valid LaTeX. Do not use raw formula text like V_{d,\\text{avg}}=... outside math delimiters.
- Never put ordinary prose inside math delimiters. Sentences must stay as normal text.
${speechRules(options.includeSpeech)}
- ${preset.lengthGuidance}
- Do not use markdown headings (#, ##, etc.), horizontal rules, or decorative lines of repeated = or - characters inside ---MARKDOWN---.
- Slide markers must be sequential: ${slideStartMarker(1)}, ${slideEndMarker(1)}, then ${slideStartMarker(2)}, ${slideEndMarker(2)}, and so on.

Exact format to follow:

${exampleSlideBlock(1, options.includeSpeech)}

${exampleSlideBlock(2, options.includeSpeech).replace(
  "Teacher-facing slide overview in Markdown, for example: This slide introduces the main idea and explains why it matters before the next slide adds detail.",
  "...",
).replace(
  "Plain narration with no LaTeX, for example: This slide introduces the main idea and explains why it matters before the next slide adds detail.",
  "...",
)}

Repeat this pattern for every slide in the PDF.

Important:
- Do not add extra commentary before or after the code block.
${options.includeSpeech ? "- Do not skip the ---MARKDOWN--- or ---SPEECH--- markers." : "- Do not skip the ---MARKDOWN--- marker, and do not include a ---SPEECH--- marker."}
- In ---MARKDOWN---, keep prose as normal text. Use math delimiters only for actual formulas.
- Bad: copying a long equation from the slide when it is not needed, putting a sentence inside $$...$$, or lines like ========== or ## inside markdown.
- Good: "This slide shows that delaying the waveform shifts each harmonic, so no extra delay calculation is needed."
- Match the number of slides to the PDF page count.`;
}
