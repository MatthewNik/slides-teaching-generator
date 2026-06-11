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
  /** Instruction text injected into the external LLM (ChatGPT) prompt. */
  externalPromptInstructions: string;
  /** Target length guidance shared by Gemini and external LLM prompts. */
  lengthGuidance: string;
};

export const TRANSCRIPT_MODE_PRESETS: Record<TranscriptMode, TranscriptModePreset> = {
  summary: {
    label: "Summary Explanation",
    description: "Concise overview of the slide.",
    promptInstructions:
      "Generate a high-level teaching transcript. Explain the main idea, key terms, diagrams, equations, or examples in enough detail that a student truly learns from the slide—not just reads it off. End with the main takeaway.",
    externalPromptInstructions:
      "Write a high-level summary explanation. Cover the main idea, key terms, diagrams, equations, and examples visible on the slide. Focus on what the student should understand and remember, not on repeating every bullet verbatim.",
    lengthGuidance:
      "Aim for roughly 180 to 280 words per slide (about 90 to 140 seconds when spoken). Be thorough enough to teach the material, not just skim it.",
  },
  conceptual: {
    label: "Conceptual Deep Dive",
    description: "Explains the why behind the slide.",
    promptInstructions:
      "Generate a deeper conceptual explanation. Explain why the topic matters, how the ideas connect, what the intuition is, what assumptions are being made, and what common misunderstandings students may have. Go into more detail than a summary.",
    externalPromptInstructions:
      "Write a longer conceptual deep dive. Explain why the topic matters, how the ideas connect, what the physical or mathematical intuition is, and what common misunderstandings students may have. Prioritize understanding over brevity.",
    lengthGuidance:
      "Aim for roughly 280 to 400 words per slide (about 140 to 200 seconds when spoken). This mode should be noticeably longer and more detailed than a summary.",
  },
  beginnerTechnical: {
    label: "Beginner + Technical",
    description: "Simple first, technical second.",
    promptInstructions:
      "Generate a two-level explanation. First explain the slide in beginner-friendly language with an analogy or plain-language intuition. Then explain it again using the proper technical terminology, formulas, and relationships from the slide.",
    externalPromptInstructions:
      "Write a two-part explanation. Part 1: explain the slide in beginner-friendly language using an analogy or everyday intuition. Part 2: explain the same content again with proper technical terminology, formulas, and relationships shown on the slide.",
    lengthGuidance:
      "Aim for roughly 250 to 380 words per slide (about 125 to 190 seconds when spoken). Both the beginner and technical sections should be substantive.",
  },
  examFocused: {
    label: "Exam-Focused",
    description: "Focuses on testable material.",
    promptInstructions:
      "Generate a transcript focused on quizzes and exams. For each formula or definition on the slide, state its name and what it is used for, then present the formula. Also cover assumptions, common question types, likely mistakes, and the main exam takeaway.",
    externalPromptInstructions:
      "Write an exam-focused explanation. For every formula, definition, or key relationship on the slide: first name it and explain what it is used for, then give the formula in proper LaTeX. Also note assumptions, common exam question styles, likely mistakes, and the main takeaway.",
    lengthGuidance:
      "Aim for roughly 220 to 340 words per slide (about 110 to 170 seconds when spoken). Cover every testable item on the slide.",
  },
  stepByStep: {
    label: "Step-by-Step Solver",
    description: "Best for examples and calculations.",
    promptInstructions:
      "Generate a step-by-step teaching transcript. If the slide contains a worked example, derivation, circuit, diagram, process, or calculation, explain every step clearly without skipping reasoning. Annotate examples by answering why each step is done that way.",
    externalPromptInstructions:
      "Write a step-by-step technical explanation. If the slide has a worked example, derivation, diagram, process, or calculation, walk through every step in order. For each step, explain what is being done and why that approach is used. Do not skip intermediate reasoning.",
    lengthGuidance:
      "Aim for roughly 300 to 450 words per slide (about 150 to 225 seconds when spoken). Worked examples should be explained step by step with annotations.",
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
