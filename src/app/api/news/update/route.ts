import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { fetchLatestEdition } from '@/lib/aggregator';
import { listEditionArchive, loadEdition } from '@/lib/storage';

export const maxDuration = 60;

export async function POST() {
  try {
    const previous = await loadEdition();
    const previousIds = new Set(previous?.stories.map((s) => s.id) ?? []);
    const { edition, stats } = await fetchLatestEdition(previousIds);
    const archive = await listEditionArchive();
    revalidatePath('/');
    return NextResponse.json({ edition, stats, archive });
  } catch (error) {
    console.error('Failed to update news:', error);
    return NextResponse.json(
      { error: 'Failed to poll internet news sources. Please try again.' },
      { status: 500 }
    );
  }
}
