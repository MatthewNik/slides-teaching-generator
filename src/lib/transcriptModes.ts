export const TRANSCRIPT_MODES = [
  "summary",
  "conceptual",
  "beginnerTechnical",
  "examFocused",
  "stepByStep",
] as const;

export type TranscriptMode = (typeof TRANSCRIPT_MODES)[number];

export const DEFAULT_TRANSCRIPT_MODE: TranscriptMode = "summary";

export type SpeechPromptVariants = {
  withSpeech: string;
  withoutSpeech: string;
};

export type TranscriptModePreset = {
  /** Short name shown in the dropdown. */
  label: string;
  /** One-line tooltip shown on the info icon. */
  description: string;
  /** Instruction text injected into the Gemini prompt. */
  promptInstructions: SpeechPromptVariants;
  /** Instruction text injected into the external LLM prompt. */
  externalPromptInstructions: SpeechPromptVariants;
  /** Target length guidance shared by Gemini and external LLM prompts. */
  lengthGuidance: string;
};

export const TRANSCRIPT_MODE_PRESETS: Record<TranscriptMode, TranscriptModePreset> = {
  summary: {
    label: "Summary Explanation",
    description: "Concise overview of the slide.",
    promptInstructions: {
      withSpeech:
        "Generate a concise slide overview plus a separate plain speech transcript. Explain what the slide is about, the main idea a student should take away, and how the visible text or diagram fits into the lesson. Do not derive formulas or copy long equations.",
      withoutSpeech:
        "Generate only a concise slide overview for reading on screen. Explain what the slide is about, the main idea a student should take away, and how the visible text or diagram fits into the lesson. Do not create narration, derive formulas, or copy long equations.",
    },
    externalPromptInstructions: {
      withSpeech:
        "Write a concise slide overview and a separate speech transcript. Explain what the slide is about and the main takeaway. Mention a formula only if it is essential to identify the slide's point, and do not work through derivations.",
      withoutSpeech:
        "Write only a concise slide overview. Explain what the slide is about and the main takeaway. Mention a formula only if it is essential to identify the slide's point, and do not write narration or work through derivations.",
    },
    lengthGuidance:
      "Aim for roughly 90 to 140 words per slide. Keep it focused on the slide's purpose, not every detail.",
  },
  conceptual: {
    label: "Conceptual Deep Dive",
    description: "Short theoretical explanation.",
    promptInstructions: {
      withSpeech:
        "Generate a short theoretical explanation plus a separate plain speech transcript. Focus on the concept behind the slide: what idea it introduces, why it matters, and how to think about it intuitively. Do not derive formulas, solve examples, or copy long equations.",
      withoutSpeech:
        "Generate only a short theoretical explanation for reading on screen. Focus on the concept behind the slide: what idea it introduces, why it matters, and how to think about it intuitively. Do not create narration, derive formulas, solve examples, or copy long equations.",
    },
    externalPromptInstructions: {
      withSpeech:
        "Write a short theoretical explanation and a separate speech transcript. Focus on the idea behind the slide and the intuition a student should understand. Do not derive formulas, solve examples, or copy long equations.",
      withoutSpeech:
        "Write only a short theoretical explanation. Focus on the idea behind the slide and the intuition a student should understand. Do not write narration, derive formulas, solve examples, or copy long equations.",
    },
    lengthGuidance:
      "Use no more than 150 words per slide. Keep this mode theoretical and concise.",
  },
  beginnerTechnical: {
    label: "Beginner + Technical",
    description: "Simple first, technical second.",
    promptInstructions: {
      withSpeech:
        "Generate a two-part slide overview plus a separate plain speech transcript. First explain the slide in plain beginner language. Then add a brief technical framing using the terms visible on the slide. Do not derive formulas or copy long equations.",
      withoutSpeech:
        "Generate only a two-part slide overview for reading on screen. First explain the slide in plain beginner language. Then add a brief technical framing using the terms visible on the slide. Do not create narration, derive formulas, or copy long equations.",
    },
    externalPromptInstructions: {
      withSpeech:
        "Write a two-part slide overview and a separate speech transcript. Part 1: plain beginner explanation of what the slide is about. Part 2: brief technical framing using the slide's terms. Avoid derivations and long equations.",
      withoutSpeech:
        "Write only a two-part slide overview. Part 1: plain beginner explanation of what the slide is about. Part 2: brief technical framing using the slide's terms. Do not write narration, derivations, or long equations.",
    },
    lengthGuidance:
      "Aim for roughly 120 to 180 words per slide across both parts.",
  },
  examFocused: {
    label: "Exam-Focused",
    description: "Focuses on what to notice for tests.",
    promptInstructions: {
      withSpeech:
        "Generate an exam-oriented slide overview plus a separate plain speech transcript. Explain what a student should recognize from this slide, what idea could be tested, and any common trap. Mention formulas only by purpose unless the exact expression is central.",
      withoutSpeech:
        "Generate only an exam-oriented slide overview for reading on screen. Explain what a student should recognize from this slide, what idea could be tested, and any common trap. Do not create narration, derive formulas, or copy long equations.",
    },
    externalPromptInstructions: {
      withSpeech:
        "Write an exam-oriented slide overview and a separate speech transcript. State what the slide is testing or preparing the student to recognize. Mention formulas only by purpose unless the exact expression is central.",
      withoutSpeech:
        "Write only an exam-oriented slide overview. State what the slide is testing or preparing the student to recognize. Do not write narration, derivations, or long equations.",
    },
    lengthGuidance:
      "Aim for roughly 100 to 160 words per slide. Keep the focus on recognition and takeaway.",
  },
  stepByStep: {
    label: "Step-by-Step Solver",
    description: "Best for process slides.",
    promptInstructions: {
      withSpeech:
        "Generate a process-focused slide overview plus a separate plain speech transcript. If the slide shows a procedure or example, summarize the high-level sequence and purpose of each stage. Do not perform derivations or detailed calculations.",
      withoutSpeech:
        "Generate only a process-focused slide overview for reading on screen. If the slide shows a procedure or example, summarize the high-level sequence and purpose of each stage. Do not create narration, perform derivations, or do detailed calculations.",
    },
    externalPromptInstructions: {
      withSpeech:
        "Write a process-focused slide overview and a separate speech transcript. Summarize the visible sequence or example at a high level. Do not solve the example in detail or derive formulas.",
      withoutSpeech:
        "Write only a process-focused slide overview. Summarize the visible sequence or example at a high level. Do not write narration, solve the example in detail, or derive formulas.",
    },
    lengthGuidance:
      "Aim for roughly 120 to 180 words per slide. Keep steps high-level and tied to what is visible.",
  },
};

export function isTranscriptMode(value: unknown): value is TranscriptMode {
  return (
    typeof value === "string" && (TRANSCRIPT_MODES as readonly string[]).includes(value)
  );
}

export function coerceTranscriptMode(value: unknown): TranscriptMode {
  return isTranscriptMode(value) ? value : DEFAULT_TRANSCRIPT_MODE;
}
