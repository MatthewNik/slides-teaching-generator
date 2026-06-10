export const TRANSCRIPT_MODES = [
  "summary",
  "conceptual",
  "beginnerTechnical",
  "examFocused",
  "stepByStep",
] as const;

export type TranscriptMode = (typeof TRANSCRIPT_MODES)[number];

export const DEFAULT_TRANSCRIPT_MODE: TranscriptMode = "summary";

export type TranscriptModePreset = {
  /** Short name shown in the dropdown. */
  label: string;
  /** One-line tooltip shown on the info icon. */
  description: string;
  /** Instruction text injected into the Gemini prompt. */
  promptInstructions: string;
};

export const TRANSCRIPT_MODE_PRESETS: Record<TranscriptMode, TranscriptModePreset> = {
  summary: {
    label: "Summary Explanation",
    description: "Concise overview of the slide.",
    promptInstructions:
      "Generate a concise teaching transcript. Explain the main idea, key terms, diagrams, equations, or examples, then end with the main takeaway. Keep it clear and not overly detailed.",
  },
  conceptual: {
    label: "Conceptual Deep Dive",
    description: "Explains the why behind the slide.",
    promptInstructions:
      "Generate a deeper conceptual explanation. Explain why the topic matters, how the ideas connect, what the intuition is, and what common misunderstandings students may have.",
  },
  beginnerTechnical: {
    label: "Beginner + Technical",
    description: "Simple first, technical second.",
    promptInstructions:
      "Generate a two-level explanation. First explain the slide in beginner-friendly language, then explain it again using the proper technical terminology, formulas, and relationships.",
  },
  examFocused: {
    label: "Exam-Focused",
    description: "Focuses on testable material.",
    promptInstructions:
      "Generate a transcript focused on quizzes and exams. Identify important formulas, definitions, assumptions, common question types, likely mistakes, and the main exam takeaway.",
  },
  stepByStep: {
    label: "Step-by-Step Solver",
    description: "Best for examples and calculations.",
    promptInstructions:
      "Generate a step-by-step teaching transcript. If the slide contains a worked example, derivation, circuit, diagram, process, or calculation, explain every step clearly without skipping reasoning.",
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
