import { z } from "zod";

export const slideTranscriptSchema = z.object({
  slideNumber: z.number().int().positive(),
  title: z.string().min(1),
  transcriptMarkdown: z.string().min(1),
  transcriptLatex: z.string().min(1),
  speechText: z.string().min(1),
  keyTerms: z.array(z.string()).default([]),
  generationStatus: z
    .enum(["draft", "generated", "reviewed", "error"])
    .default("generated"),
});

export const teachingOnlySlideTranscriptSchema = slideTranscriptSchema.extend({
  speechText: z.string().default(""),
});

export const geminiSlidesResponseSchema = z.object({
  slides: z.array(slideTranscriptSchema).min(1),
});

export const geminiTeachingOnlySlidesResponseSchema = z.object({
  slides: z.array(teachingOnlySlideTranscriptSchema).min(1),
});

export const slideUpdateSchema = z.object({
  title: z.string().min(1),
  transcriptMarkdown: z.string().min(1),
  transcriptLatex: z.string().min(1),
  speechText: z.string(),
  keyTerms: z.array(z.string()).default([]),
});

export const importedSlideInputSchema = z.object({
  slideNumber: z.number().int().positive(),
  title: z.string().min(1),
  transcriptMarkdown: z.string().min(1),
  transcriptLatex: z.string().min(1),
  speechText: z.string().default(""),
  keyTerms: z.array(z.string()).default([]),
});

export const importExternalTranscriptsSchema = z.object({
  slides: z.array(importedSlideInputSchema).min(1),
});

export type ImportedSlideInput = z.infer<typeof importedSlideInputSchema>;

export const geminiJsonSchema = {
  type: "object",
  properties: {
    slides: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          slideNumber: {
            type: "integer",
            description: "The 1-based PDF page number for this slide.",
          },
          title: {
            type: "string",
            description: "A concise teaching title for the slide.",
          },
          transcriptMarkdown: {
            type: "string",
            description:
              "Teacher-facing explanation in Markdown. Preserve equations using LaTeX delimiters like \\( ... \\) or $$ ... $$.",
          },
          transcriptLatex: {
            type: "string",
            description:
              "A LaTeX-friendly version of the explanation that keeps mathematical notation explicit and renderable.",
          },
          speechText: {
            type: "string",
            description:
              "Plain spoken narration. Equations must be verbalized as a teacher would say them, without raw LaTeX syntax.",
          },
          keyTerms: {
            type: "array",
            items: { type: "string" },
            description: "Important concepts, variables, or formulas on the slide.",
          },
          generationStatus: {
            type: "string",
            enum: ["generated"],
          },
        },
        required: [
          "slideNumber",
          "title",
          "transcriptMarkdown",
          "transcriptLatex",
          "speechText",
          "keyTerms",
          "generationStatus",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["slides"],
  additionalProperties: false,
};

export const geminiTeachingOnlyJsonSchema = {
  type: "object",
  properties: {
    slides: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          slideNumber: {
            type: "integer",
            description: "The 1-based PDF page number for this slide.",
          },
          title: {
            type: "string",
            description: "A concise teaching title for the slide.",
          },
          transcriptMarkdown: {
            type: "string",
            description:
              "Teacher-facing explanation in Markdown. Preserve equations using LaTeX delimiters like \\( ... \\) or $$ ... $$.",
          },
          transcriptLatex: {
            type: "string",
            description:
              "A LaTeX-friendly version of the explanation that keeps mathematical notation explicit and renderable.",
          },
          keyTerms: {
            type: "array",
            items: { type: "string" },
            description: "Important concepts, variables, or formulas on the slide.",
          },
          generationStatus: {
            type: "string",
            enum: ["generated"],
          },
        },
        required: [
          "slideNumber",
          "title",
          "transcriptMarkdown",
          "transcriptLatex",
          "keyTerms",
          "generationStatus",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["slides"],
  additionalProperties: false,
};
