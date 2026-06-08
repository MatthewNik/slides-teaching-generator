import { SLIDE_DELIMITER } from "./importTranscripts";
import type { DeckManifest } from "./types";

function expectedSlideCountLabel(deck: DeckManifest) {
  const count = deck.slides.length || deck.pageCount;
  return count && count > 0 ? String(count) : "the same number of pages as the attached PDF";
}

export function buildExternalLlmPrompt(deck: DeckManifest) {
  const slideCount = expectedSlideCountLabel(deck);

  return `You are creating teaching notes for a PDF slide deck named "${deck.title}".

Attach or upload the same PDF slide deck with this prompt before you respond.

Create exactly ${slideCount} slide blocks, one per PDF page, in page order.

For each slide, explain what is visible on that page for a student learning without a live instructor.

Output rules:
- Use the exact format below for every slide.
- Put Markdown with LaTeX in the ---MARKDOWN--- section. Use \\( ... \\) for inline math and $$ ... $$ on their own lines for display equations.
- Every equation, variable, subscript, superscript, fraction, and symbol must be written as proper LaTeX inside those delimiters. Do not write plain-text or Unicode math such as Ploss=IRMS2R, P_loss=I_RMS^2 R, or pasted subscript characters.
- Parenthetical notation such as (D_1), (i_s), (R), and (V_C) is accepted for inline references, but full equations should still use $$ ... $$ blocks with valid LaTeX such as $$P_\\text{loss} = I_\\text{RMS}^2 R$$.
- Use LaTeX commands for notation, for example \\(P_\\text{loss} = I_\\text{RMS}^2 R\\), \\(V_o\\), \\(\\Delta V_o\\), \\(\\cos\\phi\\), and \\(\\frac{L}{R}\\).
- Put plain spoken narration in the ---SPEECH--- section. Do not use raw LaTeX in speech text. Verbalize equations naturally.
- Keep each slide focused enough to speak in roughly 45 to 120 seconds.
- After every slide block except the last, put exactly 10 commas on their own line as the slide separator.

Exact format to follow:

========== SLIDE 1 ==========
TITLE: Short teaching title for slide 1

---MARKDOWN---
Teacher-facing explanation in Markdown with LaTeX, for example: The gain is \\(K_p\\), the phase depends on \\(\\omega t\\), and conduction loss is \\(P_\\text{loss} = I_\\text{RMS}^2 R\\).

---SPEECH---
Plain narration with no LaTeX, for example: The gain K sub p, the phase depends on omega t, and conduction loss is P loss equals I R M S squared times R.

${SLIDE_DELIMITER}

========== SLIDE 2 ==========
TITLE: Short teaching title for slide 2

---MARKDOWN---
...

---SPEECH---
...

Repeat this pattern for every slide in the PDF.

Important:
- Do not add extra commentary before or after the slide blocks.
- Do not skip the ---MARKDOWN--- or ---SPEECH--- markers.
- In ---MARKDOWN---, never leave equations as plain text or Unicode subscripts/superscripts. Always convert them to renderable LaTeX inside \\( ... \\) or $$ ... $$.
- Bad: Ploss=IRMS2R, I_RMS, v_o(t), ΔV_o without delimiters.
- Good: \\(P_\\text{loss} = I_\\text{RMS}^2 R\\), \\(I_\\text{RMS}\\), \\(v_o(t)\\), \\(\\Delta V_o\\).
- Use exactly this separator between slides, on its own line: ${SLIDE_DELIMITER}
- Match the number of slides to the PDF page count.`;
}
