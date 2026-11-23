import { connection } from 'next/server';
import { Suspense } from 'react';
import { StoryDeepDiveClient } from '@/components/StoryDeepDiveClient';
import { getCachedDeepDive, getCachedStoryById } from '@/lib/storage';

async function StoryDeepDiveLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const initialStory = getCachedStoryById(decodedId);
  const initialArticle = getCachedDeepDive(decodedId);

  return (
    <StoryDeepDiveClient
      storyId={decodedId}
      initialStory={initialStory}
      initialArticle={initialArticle}
    />
  );
}

export default function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F7F4EE] px-4 sm:px-6 lg:px-8 py-12">
          <div className="mx-auto max-w-[1440px]">
            <p className="font-display text-2xl font-bold text-[#141413]">
              THE MERIDIAN
            </p>
            <p className="mt-3 font-editorial italic text-[#5C574F]">
              Loading multi-source dispatch…
            </p>
          </div>
        </div>
      }
    >
      <StoryDeepDiveLoader params={params} />
    </Suspense>
  );
}
