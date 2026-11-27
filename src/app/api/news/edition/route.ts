import { connection, NextResponse } from 'next/server';
import { fetchLatestEdition } from '@/lib/aggregator';
import { listEditionArchive, loadEdition } from '@/lib/storage';

export const maxDuration = 60;

export async function GET(request: Request) {
  await connection();
  try {
    const { searchParams } = new URL(request.url);
    const requestedId = searchParams.get('id')?.trim() || undefined;

    const [requested, archive] = await Promise.all([
      loadEdition(requestedId),
      listEditionArchive(),
    ]);

    if (requested && requested.stories.length > 0) {
      return NextResponse.json({ edition: requested, archive });
    }

    if (requestedId) {
      const latest = await loadEdition();
      if (latest && latest.stories.length > 0) {
        return NextResponse.json({ edition: latest, archive });
      }
    }

    const { edition } = await fetchLatestEdition();
    const updatedArchive = await listEditionArchive();
    return NextResponse.json({ edition, archive: updatedArchive });
  } catch (error) {
    console.error('Failed to load edition:', error);
    return NextResponse.json(
      { error: 'Unable to retrieve the requested news edition right now.' },
      { status: 500 }
    );
  }
}
