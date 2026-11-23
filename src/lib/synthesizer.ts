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

interface AttributedParagraph {
  text: string;
  sourceName: string;
  tokens: string[];
  properNouns: string[];
  score: number;
  indexInSource: number;
}

function alreadyMentionsOutlet(text: string, sourceName: string): boolean {
  const lower = text.toLowerCase();
  const baseName = sourceName.toLowerCase().replace(/^the\s+/, '');
  return lower.includes(baseName);
}

function applySourceAttribution(
  text: string,
  sourceName: string,
  variantIndex: number
): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (alreadyMentionsOutlet(trimmed, sourceName)) {
    return trimmed;
  }

  // Keep quoted opening lines clean and unambiguous
  if (/^["“'‘]/.test(trimmed)) {
    return `${sourceName} quotes: ${trimmed}`;
  }

  // Only lowercase common sentence-initial non-proper words so country/person/org names keep capitalization
  const commonStarters =
    /^(The|A|An|It|Its|In|On|At|By|For|From|As|That|This|These|Those|There|They|Their|He|His|She|Her|We|Our|More|Most|Many|Some|Several|Over|Under|After|Before|During|Officials|Authorities|Rescuers|Police|Firefighters|Witnesses|Analysts|Campaigners|Ministers|Lawmakers|Protesters|Investors|Economists|Researchers|Scientists)\b/;
  const lowerStart = commonStarters.test(trimmed)
    ? trimmed[0].toLowerCase() + trimmed.slice(1)
    : trimmed;

  const patterns = [
    `According to ${sourceName}, ${lowerStart}`,
    `${sourceName} reports that ${lowerStart}`,
    `Reporting by ${sourceName} notes that ${lowerStart}`,
    `As detailed by ${sourceName}, ${lowerStart}`,
    `${sourceName} further notes that ${lowerStart}`,
  ];

  return patterns[variantIndex % patterns.length];
}

function scoreParagraph(text: string, indexInSource: number): number {
  let score = 0;
  // Lead paragraphs carry core who/what/where/when facts
  if (indexInSource === 0) score += 6;
  else if (indexInSource === 1) score += 4.5;
  else if (indexInSource <= 3) score += 3;
  else score += 1.5;

  // Factual density signals: figures, percentages, dates, quotes, officials
  if (/\d+/.test(text)) score += 2.2;
  if (/[£$€%]|\bmillion\b|\bbillion\b/i.test(text)) score += 1.5;
  if (/[“"'].*[”"']/.test(text)) score += 1.2;
  if (/\b(said|announced|confirmed|stated|told|warned|reported|according to)\b/i.test(text)) {
    score += 1.5;
  }
  if (text.length >= 110 && text.length <= 360) score += 1.2;
  return score;
}

function synthesizeWithAlgorithms(
  headline: string,
  summary: string,
  materials: SourceMaterial[]
): SynthesisOutput {
  const sourceNames = materials.map((m) => m.meta.name);
  const candidates: AttributedParagraph[] = [];

  for (const mat of materials) {
    const rawBlocks =
      mat.paragraphs.length > 0
        ? mat.paragraphs
        : mat.snippet && mat.snippet.length >= 45
          ? [mat.snippet]
          : [];

    rawBlocks.forEach((p, idx) => {
      const { tokens, properNouns } = extractKeywords(p);
      if (tokens.length < 4) return;
      candidates.push({
        text: p,
        sourceName: mat.meta.name,
        tokens,
        properNouns,
        score: scoreParagraph(p, idx),
        indexInSource: idx,
      });
    });
  }

  // Round-robin interleave across sources by paragraph index and factual score
  // while deduplicating near-identical statements across outlets
  const prioritized = [...candidates].sort((a, b) => {
    if (a.indexInSource !== b.indexInSource) {
      return a.indexInSource - b.indexInSource;
    }
    return b.score - a.score;
  });

  const accepted: AttributedParagraph[] = [];
  const corroborations: string[] = [];

  for (const candidate of prioritized) {
    const duplicateOf = accepted.find(
      (existing) =>
        computeSimilarity(
          candidate.tokens,
          candidate.properNouns,
          existing.tokens,
          existing.properNouns
        ) >= 0.48
    );

    if (duplicateOf) {
      if (duplicateOf.sourceName !== candidate.sourceName) {
        corroborations.push(`${duplicateOf.sourceName} & ${candidate.sourceName}`);
      }
      continue;
    }

    accepted.push(candidate);
    if (accepted.length >= 14) break;
  }

  // Build standfirst
  const leadSource = materials[0];
  const standfirst =
    summary && summary.length >= 60
      ? summary
      : summarizeToConcise(
          leadSource?.paragraphs[0] || leadSource?.snippet || headline,
          220
        );

  // Build key facts (top 4 concise non-redundant points with outlet tag)
  const keyFacts: string[] = [];
  const factCandidates = [...accepted]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const fact of factCandidates) {
    const concise = summarizeToConcise(fact.text, 190);
    if (concise) {
      keyFacts.push(`${concise} (${fact.sourceName})`);
    }
  }

  if (keyFacts.length === 0) {
    for (const mat of materials.slice(0, 4)) {
      keyFacts.push(`${mat.title} (${mat.meta.name})`);
    }
  }

  // Partition accepted paragraphs into balanced broadsheet sections
  const attributed = accepted.map((item, idx) =>
    applySourceAttribution(item.text, item.sourceName, idx)
  );

  const sections: DeepDiveSection[] = [];

  if (attributed.length >= 6) {
    const coreEnd = Math.min(3, Math.ceil(attributed.length / 3));
    const detailEnd = Math.min(attributed.length - 1, coreEnd + 5);

    sections.push({
      heading: 'Core Developments',
      paragraphs: attributed.slice(0, coreEnd),
    });
    sections.push({
      heading: 'Detailed Reporting Across Sources',
      paragraphs: attributed.slice(coreEnd, detailEnd),
    });
    if (detailEnd < attributed.length) {
      sections.push({
        heading: 'Broader Context & Additional Coverage',
        paragraphs: attributed.slice(detailEnd),
      });
    }
  } else if (attributed.length > 0) {
    const splitAt = Math.max(1, Math.ceil(attributed.length / 2));
    sections.push({
      heading: 'Core Developments',
      paragraphs: attributed.slice(0, splitAt),
    });
    if (splitAt < attributed.length) {
      sections.push({
        heading: 'Additional Source Reporting',
        paragraphs: attributed.slice(splitAt),
      });
    }
  } else {
    sections.push({
      heading: 'Dispatches Summary',
      paragraphs: materials.map(
        (mat) =>
          `${mat.meta.name} reported on this development under the headline "${mat.title}".${
            mat.snippet ? ` ${mat.snippet}` : ''
          }`
      ),
    });
  }

  const uniqueCorroborations = Array.from(new Set(corroborations)).slice(0, 3);
  const extractedCount = materials.filter(
    (m) => m.fetchStatus === 'extracted'
  ).length;

  const editorialNote = [
    `Compiled from ${materials.length} independent ${
      materials.length === 1 ? 'source' : 'sources'
    } (${sourceNames.join(', ')})`,
    extractedCount > 0
      ? `with full-text extraction from ${extractedCount} ${
          extractedCount === 1 ? 'outlet' : 'outlets'
        }.`
      : 'using verified wire summaries.',
    uniqueCorroborations.length > 0
      ? `Cross-source factual overlap verified between ${uniqueCorroborations.join('; ')}.`
      : 'Prepared using keyless multi-source factual assembly without editorial opinion.',
  ].join(' ');

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
      return `[SOURCE ${idx + 1}: ${m.meta.name} | Region: ${m.meta.region} | Type: ${m.meta.type} | Published: ${m.publishedAt}]\nHeadline: ${m.title}\nExcerpt/Text:\n${body}`;
    })
    .join('\n\n---\n\n');

  const prompt = `You are a senior broadsheet correspondent for The Meridian (a non-partisan, factual UK & International newspaper).
Write an expanded, balanced, strictly factual multi-source report on the story below using ONLY the provided source material.

RULES:
1. Remain strictly neutral, objective, and factual. Do not invent facts, numbers, quotes, or dates not present in the sources.
2. Explicitly acknowledge sources inline throughout the prose (e.g., "According to BBC News...", "The Guardian reported...", "Deutsche Welle noted...").
3. Compare or include distinct factual details from the different sources where available so the coverage is balanced.
4. Keep prose crisp, authoritative, and classic broadsheet style (British English spelling preferred where natural).
5. Return ONLY valid JSON matching this exact schema:
{
  "standfirst": "A concise 1-2 sentence factual deck summarizing the story.",
  "keyFacts": ["3 to 5 concise verified bullet facts, each ending with the source name in parentheses e.g. (BBC News)"],
  "sections": [
    { "heading": "Core Developments", "paragraphs": ["2-3 detailed factual paragraphs"] },
    { "heading": "Detailed Reporting & Perspectives", "paragraphs": ["2-4 paragraphs weaving facts from multiple outlets"] },
    { "heading": "Broader Context", "paragraphs": ["1-2 paragraphs of background context from the sources"] }
  ],
  "editorialNote": "One brief neutral sentence explaining the sources synthesized and any differences in emphasis."
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
      keyFacts: parsed.keyFacts.filter((f): f is string => typeof f === 'string').slice(0, 5),
      sections: validSections,
      editorialNote:
        typeof parsed.editorialNote === 'string'
          ? parsed.editorialNote
          : `Synthesized from ${materials.length} reputable sources.`,
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
