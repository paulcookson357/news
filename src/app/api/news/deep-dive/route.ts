import { NextResponse } from 'next/server';
import { buildDeepDiveReport, type DeepDiveInput } from '@/lib/deep-dive';
import { loadDeepDive, loadStoryById } from '@/lib/storage';
import type { StoryCategory, StorySource } from '@/lib/types';

export const maxDuration = 60;

interface DeepDiveRequestBody {
  id?: string;
  title?: string;
  summary?: string;
  section?: StoryCategory;
  publishedAt?: string;
  sources?: StorySource[];
  forceRefresh?: boolean;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DeepDiveRequestBody;
    const id = body.id?.trim();

    if (!id) {
      return NextResponse.json(
        { error: 'Missing story identifier.' },
        { status: 400 }
      );
    }

    if (!body.forceRefresh) {
      const existing = await loadDeepDive(id);
      if (existing) {
        return NextResponse.json({ article: existing, cached: true });
      }
    }

    const cachedStory = await loadStoryById(id);

    const input: DeepDiveInput | null =
      body.title && Array.isArray(body.sources) && body.sources.length > 0
        ? {
            id,
            title: body.title,
            summary: body.summary ?? '',
            section: body.section ?? 'world',
            publishedAt: body.publishedAt ?? new Date().toISOString(),
            sources: body.sources,
          }
        : cachedStory
          ? {
              id: cachedStory.id,
              title: cachedStory.title,
              summary: cachedStory.summary,
              section: cachedStory.section,
              publishedAt: cachedStory.publishedAt,
              sources: cachedStory.sources,
            }
          : null;

    if (!input) {
      return NextResponse.json(
        {
          error:
            'Story metadata is unavailable in this serverless instance. Please return to the Front Page and select the story again.',
        },
        { status: 404 }
      );
    }

    const article = await buildDeepDiveReport(input, Boolean(body.forceRefresh));
    return NextResponse.json({ article });
  } catch (error) {
    console.error('Deep dive synthesis error:', error);
    return NextResponse.json(
      { error: 'Unable to compile the multi-source report right now.' },
      { status: 500 }
    );
  }
}
