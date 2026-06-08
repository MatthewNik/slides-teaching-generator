const UNICODE_TO_LATEX: Record<string, string> = {
  "\u03C9": "\\omega",
  "\u03A9": "\\Omega",
  "\u03B1": "\\alpha",
  "\u03B2": "\\beta",
  "\u03B3": "\\gamma",
  "\u03B4": "\\delta",
  "\u0394": "\\Delta",
  "\u03C0": "\\pi",
  "\u03B8": "\\theta",
  "\u03BB": "\\lambda",
  "\u03BC": "\\mu",
  "\u03C3": "\\sigma",
  "\u2248": "\\approx",
  "\u2265": "\\geq",
  "\u2264": "\\leq",
  "\u2260": "\\neq",
  "\u221E": "\\infty",
  "\u2211": "\\sum",
  "\u222B": "\\int",
  "\u221A": "\\sqrt",
};

const UNICODE_SYMBOL_PATTERN = /[\u03C9\u03A9\u03B1\u03B2\u03B3\u03B4\u0394\u03C0\u03B8\u03BB\u03BC\u03C3\u2248\u2265\u2264\u2260\u221E\u2211\u222B\u221A]/g;

const MATH_DELIMITER_PATTERN =
  /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+\$)/g;

function replaceUnicodeSymbols(text: string) {
  return text.replace(UNICODE_SYMBOL_PATTERN, (symbol) => UNICODE_TO_LATEX[symbol] ?? symbol);
}

function toLatex(fragment: string) {
  return fragment
    .replace(/sqrt\(([^)]+)\)/g, "\\sqrt{$1}")
    .replace(/sqrt\{([^}]+)\}/g, "\\sqrt{$1}");
}

function hasMathDelimiters(text: string) {
  MATH_DELIMITER_PATTERN.lastIndex = 0;
  return MATH_DELIMITER_PATTERN.test(text);
}

function countLatexCommands(text: string) {
  return (text.match(/\\[a-zA-Z]+/g) ?? []).length;
}

export function looksLikeLatexMath(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const latexCommands = countLatexCommands(trimmed);
  const hasSubscript = /_[{]?[A-Za-z0-9]/.test(trimmed);
  const hasSuperscript = /\^[{]?[A-Za-z0-9]/.test(trimmed);
  const hasFraction = /\\frac\b/.test(trimmed);

  if (wordCount > 6 && latexCommands <= 1 && !hasSubscript && !hasSuperscript && !hasFraction) {
    return false;
  }

  if (latexCommands >= 2 || hasFraction || hasSubscript || hasSuperscript) {
    return true;
  }

  if (trimmed.length <= 80 && latexCommands >= 1) {
    return true;
  }

  if (/^[A-Za-z](?:_[A-Za-z0-9{}]+)?$/.test(trimmed)) {
    return true;
  }

  return wordCount <= 4 && /[=+\-*/^_]/.test(trimmed);
}

function unwrapProseMathDelimiters(text: string) {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (match, inner: string) =>
      looksLikeLatexMath(inner) ? match : inner.trim(),
    )
    .replace(/\$([^$\n]+)\$/g, (match, inner: string) =>
      looksLikeLatexMath(inner) ? match : inner.trim(),
    )
    .replace(/\\\(([\s\S]+?)\\\)/g, (match, inner: string) =>
      looksLikeLatexMath(inner) ? match : inner.trim(),
    )
    .replace(/\\\[([\s\S]+?)\\\]/g, (match, inner: string) =>
      looksLikeLatexMath(inner) ? match : inner.trim(),
    );
}

function protectExistingMath(markdown: string) {
  const protectedSegments: string[] = [];
  const protectedMarkdown = markdown.replace(MATH_DELIMITER_PATTERN, (segment) => {
    const token = `\uE000${protectedSegments.length}\uE000`;
    protectedSegments.push(segment);
    return token;
  });

  return { protectedMarkdown, protectedSegments };
}

function restoreProtectedMath(normalized: string, protectedSegments: string[]) {
  return protectedSegments.reduce(
    (result, _segment, index) =>
      result.replace(`\uE000${index}\uE000`, () => protectedSegments[index] ?? ""),
    normalized,
  );
}

function isEscapedOpeningParen(text: string, offset: number) {
  return offset > 0 && text[offset - 1] === "\\";
}

function wrapInlineMathFragment(prefix: string, fragment: string, match: string, offset: number, whole: string) {
  if (prefix === "(" && isEscapedOpeningParen(whole, offset)) {
    return match;
  }

  return `${prefix}\\(${toLatex(fragment)}\\)`;
}

function normalizeParenWrappedMath(text: string) {
  return text
    .replace(/\(([A-Z](?:_[A-Za-z0-9{}]+)?)\)/g, (match, inner: string, offset: number, whole: string) =>
      isEscapedOpeningParen(whole, offset) ? match : `\\(${toLatex(inner)}\\)`,
    )
    .replace(
      /\(([^()\n]*(?:\\[a-zA-Z]+|[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9{}]+|sqrt(?:\{[^}]+\}|\([^)]+\)))[^()\n]*)\)/g,
      (match, inner: string, offset: number, whole: string) =>
        isEscapedOpeningParen(whole, offset) ? match : `\\(${toLatex(inner)}\\)`,
    );
}

function normalizeProseDisplayMath(markdown: string) {
  return markdown.replace(/\$\$([\s\S]+?)\$\$/g, (match, inner: string) => {
    const trimmed = inner.trim();
    const proseMatch = trimmed.match(/^(.+?)\\text\{([^}]+)\}\.?$/);

    if (!proseMatch) {
      return match;
    }

    const [, mathPart, prosePart] = proseMatch;
    const normalizedMath = mathPart?.trim() ?? "";
    const normalizedProse = prosePart?.trim().replace(/\.+$/, "") ?? "";

    if (
      !normalizedMath ||
      !normalizedProse ||
      normalizedProse.split(/\s+/).length < 4 ||
      /\\[a-zA-Z]+/.test(normalizedProse)
    ) {
      return match;
    }

    if (!looksLikeLatexMath(normalizedMath)) {
      return match;
    }

    return `$${normalizedMath}$ ${normalizedProse}.`;
  });
}

export function normalizeMathFragments(
  markdown: string,
  mode: "conservative" | "aggressive" = "conservative",
) {
  const withSymbols = replaceUnicodeSymbols(normalizeProseDisplayMath(markdown));
  const { protectedMarkdown, protectedSegments } = protectExistingMath(withSymbols);

  const normalized = normalizeParenWrappedMath(protectedMarkdown)
    .replace(
      /(^|[\s[{,;:])((?:\\frac\{[^}]+\}\{[^}]+\}|\\sqrt\{[^}]+\}|sqrt\{[^}]+\}|\\(?:omega|Omega|alpha|beta|Delta|delta|pi|theta|lambda|mu|sigma|cos|sin|tan|approx|gg)\b(?:\s*[A-Za-z](?:_[A-Za-z0-9{}]+)?)?|[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9{}]+))/g,
      (match, prefix: string, fragment: string, offset: number, whole: string) =>
        wrapInlineMathFragment(prefix, fragment, match, offset, whole),
    )
    .replace(
      /(^|[\s[{,;:])((?:[A-Za-z][A-Za-z0-9]*)\^(?:\{[^}]+\}|\d+))/g,
      (match, prefix: string, fragment: string, offset: number, whole: string) =>
        wrapInlineMathFragment(prefix, fragment, match, offset, whole),
    );

  const aggressiveNormalized =
    mode === "aggressive"
      ? normalized.replace(
          /(^|[\s[{,;:])((?:[A-Za-z][A-Za-z0-9]*)(?:_\{[^}]+\}|_[A-Za-z0-9]+)?)/g,
          (match, prefix: string, fragment: string, offset: number, whole: string) => {
            if (/^(The|This|That|For|And|With|When|Where|Which|Each|Every|Note|Slide)$/i.test(fragment)) {
              return match;
            }

            return wrapInlineMathFragment(prefix, fragment, match, offset, whole);
          },
        )
      : normalized;

  return restoreProtectedMath(aggressiveNormalized, protectedSegments);
}

function latexToMarkdownParagraphs(latex: string) {
  const trimmed = latex.trim();
  if (!trimmed) return "";

  if (hasMathDelimiters(trimmed)) {
    return unwrapProseMathDelimiters(trimmed);
  }

  if (!looksLikeLatexMath(trimmed)) {
    return trimmed;
  }

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      if (looksLikeLatexMath(paragraph)) {
        return `\\(${paragraph}\\)`;
      }
      return paragraph;
    })
    .join("\n\n");
}

function hasMeaningfulProse(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length >= 8;
}

export function resolveTranscriptForDisplay(
  markdown: string,
  latex: string,
  mode: "conservative" | "aggressive" = "conservative",
) {
  const normalizedMarkdown = normalizeMathFragments(markdown, mode);
  const unwrappedMarkdown = unwrapProseMathDelimiters(normalizedMarkdown);

  if (hasMathDelimiters(unwrappedMarkdown) || hasMeaningfulProse(unwrappedMarkdown)) {
    return prepareMathForRender(unwrappedMarkdown);
  }

  const latexMarkdown = latexToMarkdownParagraphs(latex);
  if (latexMarkdown && hasMathDelimiters(latexMarkdown) && !hasMeaningfulProse(latexMarkdown)) {
    return prepareMathForRender(normalizeMathFragments(latexMarkdown, mode));
  }

  if (latexMarkdown && hasMeaningfulProse(latexMarkdown)) {
    return prepareMathForRender(latexMarkdown);
  }

  return prepareMathForRender(unwrappedMarkdown);
}

function convertLatexDelimitersToDollars(text: string) {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (match, inner: string) =>
      looksLikeLatexMath(inner) ? `$$${inner.trim()}$$` : inner.trim(),
    )
    .replace(/\\\(([\s\S]+?)\\\)/g, (match, inner: string) =>
      looksLikeLatexMath(inner) ? `$${inner.trim()}$` : inner.trim(),
    );
}

export function prepareMathForRender(markdown: string) {
  const unescaped = markdown
    .replace(/\\\\\(/g, "\\(")
    .replace(/\\\\\)/g, "\\)")
    .replace(/\\\\\[/g, "\\[")
    .replace(/\\\\\]/g, "\\]");

  return convertLatexDelimitersToDollars(unwrapProseMathDelimiters(unescaped));
}
