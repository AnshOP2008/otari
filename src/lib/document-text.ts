const CHUNK_SIZE = 4000;
const CHUNK_OVERLAP = 150;

export function sourceLabel(name: string) {
  if (name === "gmail!@#.txt") return "Gmail inbox";
  if (name === "calendar!@#.txt") return "Google Calendar";
  return name;
}

export function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(text: string): string[] {
  const clean = normalizeText(text);
  if (!clean) return [];

  const chunks: string[] = [];
  let index = 0;

  while (index < clean.length) {
    const end = Math.min(index + CHUNK_SIZE, clean.length);
    const slice = clean.slice(index, end);

    const trimmed = slice.trim();
    if (trimmed.length > 0) {
      chunks.push(trimmed);
    }

    if (end >= clean.length) {
      break;
    }

    index += Math.max(slice.length - CHUNK_OVERLAP, 1);
  }

  return chunks;
}

const commonWords = new Set(
  "about and are can could for from have help how make my of on please show should tell that the this what when where which will with would you your".split(
    " ",
  ),
);

export function searchTerms(query: string): string[] {
  const words =
    query
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return [...new Set(words.filter((word) => !commonWords.has(word)))].slice(0, 24);
}

export function excerptForQuery(content: string, query: string, limit = 1200): string {
  if (content.length <= limit) return content;
  const lower = content.toLowerCase();
  const terms = searchTerms(query);
  const blocks = content.match(/[^\n.!?]+[\n.!?]*/g) ?? [content];
  let bestPosition = 0;
  let bestScore = 0;
  let position = 0;
  for (const block of blocks) {
    const words = new Set(searchTerms(block));
    const score = terms.filter((term) => words.has(term)).length;
    if (score > bestScore) {
      bestPosition = position;
      bestScore = score;
    }
    position += block.length;
  }
  const exact = query.length >= 4 ? lower.indexOf(query.toLowerCase()) : -1;
  const start = Math.min(
    content.length - limit,
    Math.max(0, (exact >= 0 ? exact : bestPosition) - 180),
  );
  return (
    (start ? "…" : "") +
    content.slice(start, start + limit).trim() +
    (start + limit < content.length ? "…" : "")
  );
}
