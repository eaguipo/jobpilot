/**
 * Turns job-post HTML from a board API into readable plain text (task 22).
 * The result is only ever shown as text and sent to the LLM, never rendered as HTML,
 * so this aims for readability, not sanitising.
 */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·",
};

/** Decodes &amp; &#39; &#x2019; and the common named entities; leaves unknown ones as they are. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li\s*>/gi, "") // the next <li> or </ul> already breaks the line
    .replace(/<\/?(p|div|section|article|ul|ol|h[1-6]|tr|table|blockquote|hr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return tidy(decodeEntities(text));
}

/** Collapses runs of spaces, trims lines and keeps at most one blank line in a row. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
