import * as cheerio from 'cheerio';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'has', 'had',
  'are', 'was', 'were', 'will', 'would', 'could', 'should', 'can', 'may',
  'might', 'about', 'after', 'before', 'over', 'under', 'into', 'onto',
  'than', 'then', 'them', 'they', 'their', 'there', 'here', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'how', 'all', 'any',
  'both', 'each', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
  'same', 'too', 'very', 'just', 'but', 'not', 'now', 'out', 'off', 'one',
  'two', 'new', 'says', 'said', 'say', 'according', 'amid', 'during', 'between',
  'against', 'being', 'been', 'also', 'year', 'years', 'day', 'days', 'week',
  'weeks', 'month', 'months', 'first', 'last', 'next', 'many', 'much', 'even',
  'still', 'back', 'make', 'made', 'take', 'took', 'get', 'got', 'see', 'seen',
  'news', 'live', 'updates', 'report', 'reports', 'bbc', 'guardian', 'sky',
  'reuters', 'associated', 'press', 'npr', 'pbs', 'jazeera', 'france', 'dw',
]);

export function decodeAndStripHtml(raw: string): string {
  if (!raw) return '';
  // Preserve word boundaries when block-level tags separate sentences/headings
  const spaced = raw.replace(
    /<\/?(?:p|div|br|li|h[1-6]|blockquote|tr|td|section|article)\b[^>]*>/gi,
    ' $& '
  );
  // First pass handles escaped HTML entities inside RSS descriptions
  const $ = cheerio.load(`<div>${spaced}</div>`);
  let text = $('div').text();
  // Second pass if raw contained double-encoded entities like &amp;rsquo;
  if (/&[a-zA-Z0-9#]+;/.test(text)) {
    const $2 = cheerio.load(`<div>${text}</div>`);
    text = $2('div').text();
  }
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanHeadline(title: string): string {
  const clean = decodeAndStripHtml(title);
  // Strip trailing outlet attributions Google News / Bing sometimes append
  return clean
    .replace(/\s+-\s+(BBC News|BBC|The Guardian|Sky News|Associated Press|AP News|Reuters|NPR|PBS NewsHour|Al Jazeera|Deutsche Welle|DW|France 24|ABC News|Ars Technica)$/i, '')
    .replace(/\s+\|\s+(BBC News|The Guardian|Sky News|AP News|Al Jazeera|DW)$/i, '')
    .trim();
}

export function cleanPromoText(text: string): string {
  const clean = decodeAndStripHtml(text);
  return clean
    .replace(/Continue reading\.\.\.?/gi, '')
    .replace(/Read more\.\.\.?/gi, '')
    .replace(/Sign up (for|to)[^.!?]*[.!?]?/gi, '')
    .replace(/Subscribe (for|to)[^.!?]*[.!?]?/gi, '')
    .replace(/Follow us on[^.!?]*[.!?]?/gi, '')
    .replace(/Get the latest[^.!?]*[.!?]?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace + uppercase/quote,
  // avoiding decimal numbers like 4.2% or abbreviations like Mr. / U.S.
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    // Skip decimal points between digits (e.g. 4.2%)
    if (ch === '.' && i > 0 && /\d/.test(text[i - 1]) && /\d/.test(text[i + 1] ?? '')) {
      continue;
    }

    // Skip common abbreviations
    if (ch === '.') {
      const prefix = text.slice(Math.max(0, i - 5), i + 1);
      if (/\b(?:Mr|Mrs|Ms|Dr|St|Prof|No|U\.S|U\.K)\.$/i.test(prefix)) {
        continue;
      }
    }

    const next = text[i + 1] ?? '';
    if (next === '' || /\s/.test(next)) {
      const chunk = text.slice(start, i + 1).trim();
      if (chunk) sentences.push(chunk);
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences.length > 0 ? sentences : [text];
}

export function summarizeToConcise(rawText: string, maxChars = 250): string {
  const cleaned = cleanPromoText(rawText);
  if (!cleaned) return '';

  const sentences = splitIntoSentences(cleaned);
  let result = '';

  for (const sentence of sentences) {
    const candidate = result ? `${result} ${sentence.trim()}` : sentence.trim();
    if (candidate.length <= maxChars) {
      result = candidate;
      // Two crisp sentences are ideal for front-page summaries
      if (result.length >= 135) break;
    } else {
      break;
    }
  }

  if (!result) {
    const sliced = cleaned.slice(0, maxChars - 1);
    const lastSpace = sliced.lastIndexOf(' ');
    result = `${lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced}…`;
  }

  return result;
}

export function extractKeywords(text: string): {
  tokens: string[];
  properNouns: string[];
} {
  const clean = decodeAndStripHtml(text);
  const words = clean.match(/[A-Za-z0-9£$€'-]{2,}/g) ?? [];
  const tokenSet = new Set<string>();
  const properSet = new Set<string>();

  for (let i = 0; i < words.length; i++) {
    const raw = words[i].replace(/^['-]+|['-]+$/g, '');
    if (raw.length < 3) continue;
    const lower = raw.toLowerCase();
    if (STOPWORDS.has(lower)) continue;

    tokenSet.add(lower);

    // Track capitalized entities / numbers / acronyms for stronger clustering
    if (
      /^[A-Z][a-zA-Z'-]{2,}$/.test(raw) ||
      /^[A-Z0-9]{2,}$/.test(raw) ||
      /\d/.test(raw)
    ) {
      properSet.add(lower);
    }
  }

  return {
    tokens: Array.from(tokenSet),
    properNouns: Array.from(properSet),
  };
}

export function computeSimilarity(
  aTokens: string[],
  aProper: string[],
  bTokens: string[],
  bProper: string[]
): number {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  const setA = new Set(aTokens);
  const setB = new Set(bTokens);
  let sharedTokens = 0;
  for (const token of setA) {
    if (setB.has(token)) sharedTokens++;
  }
  const unionTokens = setA.size + setB.size - sharedTokens;
  const jaccard = unionTokens > 0 ? sharedTokens / unionTokens : 0;

  let sharedProper = 0;
  if (aProper.length > 0 && bProper.length > 0) {
    const pA = new Set(aProper);
    const pB = new Set(bProper);
    for (const p of pA) {
      if (pB.has(p)) sharedProper++;
    }
  }

  const minLen = Math.min(setA.size, setB.size);
  const overlapRatio = minLen > 0 ? sharedTokens / minLen : 0;

  // Boost when multiple proper nouns or figures align
  const properBonus = sharedProper >= 3 ? 0.18 : sharedProper === 2 ? 0.08 : 0;

  return Math.max(jaccard, overlapRatio * 0.72) + properBonus;
}

export function makeStoryId(title: string): string {
  const clean = cleanHeadline(title).toLowerCase();
  const slug = clean
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 7)
    .join('-');

  let hash = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const shortHash = (hash >>> 0).toString(36).slice(0, 6);
  return `${slug || 'story'}-${shortHash}`;
}

export function buildSearchQueries(title: string): string[] {
  const clean = cleanHeadline(title);
  const { tokens, properNouns } = extractKeywords(clean);

  // Prioritise proper nouns & specific words to keep search queries crisp
  const prioritized = Array.from(new Set([...properNouns, ...tokens])).slice(0, 7);
  const mainQuery = prioritized.length >= 3 ? prioritized.join(' ') : clean;

  const focusedTerms = (properNouns.length >= 3 ? properNouns : tokens).slice(0, 5);
  const compactQuery = focusedTerms.join(' ');

  const queries = [mainQuery];
  if (compactQuery && compactQuery !== mainQuery) {
    queries.push(compactQuery);
  }
  return queries;
}
