import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { fetchLatestEdition } from '@/lib/aggregator';
import { loadEdition } from '@/lib/storage';

export const maxDuration = 60;

type EditionSlot = 'morning' | 'midday' | 'evening' | 'scheduled';

const VALID_SLOTS = new Set<EditionSlot>([
  'morning',
  'midday',
  'evening',
  'scheduled',
]);

function normalizeSlot(raw: unknown): EditionSlot {
  if (typeof raw === 'string') {
    const cleaned = raw.trim().toLowerCase() as EditionSlot;
    if (VALID_SLOTS.has(cleaned)) return cleaned;
  }
  return 'scheduled';
}

function isAuthorized(
  headerSecret: string | null,
  expectedSecret: string | undefined
): boolean {
  const provided = headerSecret?.trim();
  const expected = expectedSecret?.trim();
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const headerSecret = request.headers.get('x-meridian-cron-secret');
  const expectedSecret = process.env.MERIDIAN_WRITE_SECRET;

  if (!isAuthorized(headerSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let slot: EditionSlot = 'scheduled';
  try {
    const body = (await request.json()) as { slot?: unknown };
    slot = normalizeSlot(body?.slot);
  } catch {
    // Allow empty or non-JSON bodies cleanly
  }

  try {
    const previous = await loadEdition();
    const previousIds = new Set(previous?.stories.map((s) => s.id) ?? []);
    const { edition, stats } = await fetchLatestEdition(previousIds);
    revalidatePath('/');

    return NextResponse.json({
      ok: true,
      slot,
      updatedAt: edition.updatedAt,
      stats,
    });
  } catch (error) {
    console.error('Scheduled edition update failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate scheduled edition.' },
      { status: 500 }
    );
  }
}
