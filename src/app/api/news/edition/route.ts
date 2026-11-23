import { connection, NextResponse } from 'next/server';
import { fetchLatestEdition } from '@/lib/aggregator';
import { loadEdition } from '@/lib/storage';

export const maxDuration = 60;

export async function GET() {
  await connection();
  try {
    const cached = await loadEdition();
    if (cached && cached.stories.length > 0) {
      return NextResponse.json({ edition: cached });
    }

    const { edition } = await fetchLatestEdition();
    return NextResponse.json({ edition });
  } catch (error) {
    console.error('Failed to load edition:', error);
    return NextResponse.json(
      { error: 'Unable to retrieve the latest news edition right now.' },
      { status: 500 }
    );
  }
}
