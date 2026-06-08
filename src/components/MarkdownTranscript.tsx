"use client";

import { resolveTranscriptForDisplay } from "@/lib/mathNormalize";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type MarkdownTranscriptProps = {
  markdown: string;
  latex?: string;
  mathMode?: "conservative" | "aggressive";
};

export function MarkdownTranscript({
  markdown,
  latex = "",
  mathMode = "conservative",
}: MarkdownTranscriptProps) {
  const content = resolveTranscriptForDisplay(markdown, latex, mathMode);

  return (
    <div className="prose-slide">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
