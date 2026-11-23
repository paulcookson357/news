import { NextResponse } from 'next/server';
import { fetchLatestEdition } from '@/lib/aggregator';
import { getCachedEdition } from '@/lib/storage';

export const maxDuration = 60;

export async function POST() {
  try {
    const previous = getCachedEdition();
    const previousIds = new Set(previous?.stories.map((s) => s.id) ?? []);
    const { edition, stats } = await fetchLatestEdition(previousIds);
    return NextResponse.json({ edition, stats });
  } catch (error) {
    console.error('Failed to update news:', error);
    return NextResponse.json(
      { error: 'Failed to poll internet news sources. Please try again.' },
      { status: 500 }
    );
  }
}
