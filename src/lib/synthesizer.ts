import { computeSimilarity, extractKeywords, summarizeToConcise } from './text-utils';
import type {
  DeepDiveSection,
  DeepDiveSourceDetail,
  SourceMeta,
  StoryCategory,
} from './types';

export interface SourceMaterial {
  meta: SourceMeta;
  title: string;
  url: string;
  publishedAt: string;
  paragraphs: string[];
  snippet: string;
  wordCount: number;
  fetchStatus: 'extracted' | 'snippet';
}

export interface SynthesisOutput {
  standfirst: string;
  keyFacts: string[];
  sections: DeepDiveSection[];
  editorialNote: string;
  synthesisMode: 'ai' | 'algorithmic';
}

interface NarrativeParagraph {
  text: string;
  sourceName: string;
  tokens: string[];
  properNouns: string[];
  score: number;
  indexInSource: number;
}

function isQuoteHeavyParagraph(text: string): boolean {
  const trimmed = text.trim();
  // Standalone quote paragraphs (no preceding narrative framing)
  if (/^["“'‘]/.test(trimmed)) return true;

  // Compute proportion of characters inside direct quotes
  const quotedSegments = trimmed.match(/["“][^"”]{10,}["”]/g) ?? [];
  const quotedLen = quotedSegments.reduce((sum, seg) => sum + seg.length, 0);
  if (trimmed.length > 0 && quotedLen / trimmed.length > 0.55) {
    return true;
  }
  return false;
}

function stripOutletSelfReferences(text: string): string {
  return text
    .replace(/\s*\((?:Reuters|AP|Associated Press|BBC|BBC News|CNBC|AFP)\)\s*$/i, '')
    .replace(/\s*[—–-]\s*(?:BBC News|The Guardian|CNBC|Deutsche Welle|France 24|Al Jazeera|NPR|Sky News|PBS NewsHour|Investing\.com|FXStreet)\.?$/i, '.')
    .replace(/\s+\b(?:BBC News|The Guardian|Sky News|Associated Press|AP News|Reuters|NPR|PBS NewsHour|Al Jazeera|Deutsche Welle|France 24|CNBC|Investing\.com|FXStreet)\s*$/i, '')
    .replace(/\s*\bDW has more\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSubstantiveSentence(text: string): boolean {
  if (text.length < 50) return false;
  if (/\.\.\.$/.test(text) || /…$/.test(text)) return false;
  return /[.!?]["”'’)]?$/.test(text);
}

function scoreParagraph(text: string, indexInSource: number): number {
  let score = 0;
  if (indexInSource === 0) score += 6;
  else if (indexInSource === 1) score += 4.5;
  else if (indexInSource <= 3) score += 3;
  else score += 1.5;

  if (/\d+/.test(text)) score += 2.2;
  if (/[£$€%]|\bmillion\b|\bbillion\b/i.test(text)) score += 1.5;
  if (/\b(said|announced|confirmed|stated|warned|reported|rose|fell|grew|cut)\b/i.test(text)) {
    score += 1.2;
  }
  if (text.length >= 110 && text.length <= 380) score += 1.2;
  return score;
}

function synthesizeWithAlgorithms(
  headline: string,
  summary: string,
  materials: SourceMaterial[]
): SynthesisOutput {
  // Prioritize extracted full-text reporting and freshest timestamps first so
  // the narrative spine reflects the latest confirmed developments without contradicting itself.
  const orderedMaterials = [...materials].sort((a, b) => {
    const aExtracted = a.fetchStatus === 'extracted' ? 1 : 0;
    const bExtracted = b.fetchStatus === 'extracted' ? 1 : 0;
    if (aExtracted !== bExtracted) return bExtracted - aExtracted;
    return b.publishedAt.localeCompare(a.publishedAt);
  });

  const accepted: NarrativeParagraph[] = [];
  const acceptIfDistinct = (candidate: NarrativeParagraph): boolean => {
    const threshold = candidate.indexInSource === 0 ? 0.28 : 0.36;
    const duplicate = accepted.some(
      (existing) =>
        computeSimilarity(
          candidate.tokens,
          candidate.properNouns,
          existing.tokens,
          existing.properNouns
        ) >= threshold
    );
    if (duplicate) return false;
    accepted.push(candidate);
    return true;
  };

  // 1. Build cohesive narrative spine from the freshest extracted primary article
  const primary = orderedMaterials[0];
  if (primary) {
    const primaryBlocks =
      primary.paragraphs.length > 0
        ? primary.paragraphs
        : primary.snippet && isSubstantiveSentence(primary.snippet)
          ? [primary.snippet]
          : [];

    primaryBlocks.forEach((rawP, idx) => {
      if (accepted.length >= 6) return;
      const cleaned = stripOutletSelfReferences(rawP);
      if (!cleaned || !isSubstantiveSentence(cleaned) || isQuoteHeavyParagraph(cleaned)) return;
      const { tokens, properNouns } = extractKeywords(cleaned);
      if (tokens.length < 4) return;
      acceptIfDistinct({
        text: cleaned,
        sourceName: primary.meta.name,
        tokens,
        properNouns,
        score: scoreParagraph(cleaned, idx),
        indexInSource: idx,
      });
    });
  }

  // 2. Enrich with genuinely new factual developments and background from secondary sources
  for (const mat of orderedMaterials.slice(1)) {
    if (accepted.length >= 10) break;
    const blocks =
      mat.paragraphs.length > 0
        ? mat.paragraphs
        : mat.snippet && isSubstantiveSentence(mat.snippet)
          ? [mat.snippet]
          : [];

    let addedFromSource = 0;
    for (let idx = 0; idx < blocks.length; idx++) {
      if (accepted.length >= 10 || addedFromSource >= 2) break;
      // Skip opening lead paragraph on older secondary articles when we already have a full-text lead
      if (idx === 0 && primary?.fetchStatus === 'extracted' && blocks.length > 1) {
        continue;
      }
      const cleaned = stripOutletSelfReferences(blocks[idx]);
      if (!cleaned || !isSubstantiveSentence(cleaned) || isQuoteHeavyParagraph(cleaned)) continue;
      const { tokens, properNouns } = extractKeywords(cleaned);
      if (tokens.length < 4) continue;
      if (
        acceptIfDistinct({
          text: cleaned,
          sourceName: mat.meta.name,
          tokens,
          properNouns,
          score: scoreParagraph(cleaned, idx),
          indexInSource: idx,
        })
      ) {
        addedFromSource++;
      }
    }
  }

  // Fallback if aggressive quote filtering left very few paragraphs
  if (accepted.length < 2) {
    for (const mat of orderedMaterials) {
      const blocks =
        mat.paragraphs.length > 0
          ? mat.paragraphs
          : mat.snippet
            ? [mat.snippet]
            : [];
      for (let idx = 0; idx < blocks.length; idx++) {
        if (accepted.length >= 5) break;
        const cleaned = stripOutletSelfReferences(blocks[idx]);
        if (!cleaned) continue;
        const { tokens, properNouns } = extractKeywords(cleaned);
        if (tokens.length < 3) continue;
        acceptIfDistinct({
          text: cleaned,
          sourceName: mat.meta.name,
          tokens,
          properNouns,
          score: scoreParagraph(cleaned, idx),
          indexInSource: idx,
        });
      }
    }
  }

  const standfirst =
    summary && summary.length >= 60
      ? summary
      : summarizeToConcise(
          accepted[0]?.text || primary?.snippet || headline,
          220
        );

  const keyFacts: string[] = [];
  const factCandidates = [...accepted]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  for (const fact of factCandidates) {
    const concise = summarizeToConcise(fact.text, 190);
    if (concise) {
      keyFacts.push(concise);
    }
  }

  if (keyFacts.length === 0) {
    for (const mat of orderedMaterials.slice(0, 4)) {
      keyFacts.push(mat.title);
    }
  }

  const proseParagraphs = accepted.map((item) => item.text);
  const sections: DeepDiveSection[] = [];

  if (proseParagraphs.length >= 7) {
    const splitAt = Math.min(5, Math.ceil(proseParagraphs.length * 0.55));
    sections.push({
      heading: 'Lead Story',
      paragraphs: proseParagraphs.slice(0, splitAt),
    });
    sections.push({
      heading: 'Background & Context',
      paragraphs: proseParagraphs.slice(splitAt),
    });
  } else if (proseParagraphs.length > 0) {
    sections.push({
      heading: 'Lead Story',
      paragraphs: proseParagraphs,
    });
  } else {
    sections.push({
      heading: 'Lead Story',
      paragraphs: orderedMaterials
        .map((mat) => stripOutletSelfReferences(mat.snippet || mat.title))
        .filter(Boolean),
    });
  }

  const editorialNote = `Compiled from ${materials.length} independent news ${
    materials.length === 1 ? 'source' : 'sources'
  } referenced below, synthesized without editorial opinion.`;

  return {
    standfirst,
    keyFacts,
    sections,
    editorialNote,
    synthesisMode: 'algorithmic',
  };
}

async function synthesizeWithGemini(
  headline: string,
  section: StoryCategory,
  summary: string,
  materials: SourceMaterial[]
): Promise<SynthesisOutput | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const sourceDossiers = materials
    .map((m, idx) => {
      const body =
        m.paragraphs.length > 0
          ? m.paragraphs.slice(0, 10).join('\n\n')
          : m.snippet || m.title;
      return `[SOURCE ${idx + 1}: ${m.meta.name} | Region: ${m.meta.region} | Published: ${m.publishedAt}]\nHeadline: ${m.title}\nExcerpt/Text:\n${body}`;
    })
    .join('\n\n---\n\n');

  const prompt = `You are a senior broadsheet journalist writing for The Meridian (a non-partisan, factual UK & International newspaper).
Write an expanded, balanced, strictly factual news article on the story below using ONLY the provided source material.

RULES:
1. Write as a single, seamless, authoritative standard news article in crisp inverted-pyramid broadsheet prose (British English spelling preferred where natural).
2. Do NOT attribute facts or statements to news outlets inside the article prose or key facts (never write "According to BBC News...", "The Guardian reported...", "CNBC noted...", etc.). All consulted outlets are referenced in a dedicated section below the article.
3. Do NOT write a collection of quotes. Synthesize reported statements and figures into natural third-person narrative prose; use at most one brief direct quote only if essential to the story.
4. Reconcile timestamps across sources so the story consistently reflects the latest verified facts without contradicting itself.
5. Remain strictly neutral, objective, and factual. Do not invent facts, numbers, quotes, or dates not present in the sources.
6. Return ONLY valid JSON matching this exact schema:
{
  "standfirst": "A concise 1-2 sentence factual deck summarizing the story.",
  "keyFacts": ["3 to 4 concise verified bullet facts with NO outlet names in parentheses"],
  "sections": [
    { "heading": "Lead Story", "paragraphs": ["3-4 cohesive narrative opening paragraphs"] },
    { "heading": "Key Developments", "paragraphs": ["2-3 narrative paragraphs covering details and impacts"] },
    { "heading": "Background & Context", "paragraphs": ["1-2 paragraphs of factual background"] }
  ],
  "editorialNote": "One brief neutral sentence noting this report was compiled from the independent sources referenced below."
}

Story Headline: ${headline}
Section: ${section}
Front-page summary: ${summary}

VERIFIED SOURCE MATERIAL:
${sourceDossiers}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(18000),
      }
    );

    if (!res.ok) return null;
    const payload = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText) as Partial<SynthesisOutput>;
    if (
      typeof parsed.standfirst !== 'string' ||
      !Array.isArray(parsed.keyFacts) ||
      !Array.isArray(parsed.sections) ||
      parsed.sections.length === 0
    ) {
      return null;
    }

    const validSections = parsed.sections.filter(
      (sec) =>
        sec &&
        typeof sec.heading === 'string' &&
        Array.isArray(sec.paragraphs) &&
        sec.paragraphs.length > 0
    );
    if (validSections.length === 0) return null;

    return {
      standfirst: parsed.standfirst,
      keyFacts: parsed.keyFacts
        .filter((f): f is string => typeof f === 'string')
        .slice(0, 5),
      sections: validSections,
      editorialNote:
        typeof parsed.editorialNote === 'string'
          ? parsed.editorialNote
          : `Compiled from ${materials.length} independent news sources referenced below.`,
      synthesisMode: 'ai',
    };
  } catch {
    return null;
  }
}

export async function synthesizeBroadsheetReport(
  headline: string,
  section: StoryCategory,
  summary: string,
  materials: SourceMaterial[]
): Promise<{ synthesis: SynthesisOutput; sourceDetails: DeepDiveSourceDetail[] }> {
  const aiResult = await synthesizeWithGemini(headline, section, summary, materials);
  const synthesis =
    aiResult ?? synthesizeWithAlgorithms(headline, summary, materials);

  const sourceDetails: DeepDiveSourceDetail[] = materials.map((m) => ({
    name: m.meta.name,
    domain: m.meta.domain,
    region: m.meta.region,
    type: m.meta.type,
    title: m.title,
    url: m.url,
    publishedAt: m.publishedAt,
    wordCount: m.wordCount,
    excerpt: summarizeToConcise(m.paragraphs[0] || m.snippet || m.title, 180),
    fetchStatus: m.fetchStatus,
  }));

  return { synthesis, sourceDetails };
}
