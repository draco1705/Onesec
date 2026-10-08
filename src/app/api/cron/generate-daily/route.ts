import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchArtistDiscography } from '@/lib/music';
import { saveStoredChallenge } from '@/lib/challenges-store';

const CRON_SECRET = process.env.CRON_SECRET || 'secret';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { artistName, playDate, customPool, customTitles, customImage, isDraft } = await request.json();
    if (!artistName || !playDate) {
      return NextResponse.json({ error: 'Missing artistName or playDate' }, { status: 400 });
    }

    let finalArtistName = artistName;
    let finalImageUrl = customImage || '';
    let finalTracks = customPool || [];
    let finalTitles = customTitles || [];

    // If no custom pool provided, fetch automatically
    if (!customPool || customPool.length === 0) {
      const { artistName: fetchedArtistName, artistImageUrl, targetTracks, allTitles } = await fetchArtistDiscography(artistName);
      finalArtistName = fetchedArtistName;
      finalImageUrl = artistImageUrl;
      finalTracks = targetTracks;
      finalTitles = allTitles;
    }

    // Always save to the resilient local store first
    const savedLocal = saveStoredChallenge({
      play_date: playDate,
      artist_name: finalArtistName,
      artist_image_url: finalImageUrl,
      track_pool: finalTracks,
      all_searchable_titles: finalTitles,
      is_draft: !!isDraft,
    });

    // Optionally also sync to Supabase if available, but do not crash if it fails
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('dummy')) {
        await supabase
          .from('daily_challenges')
          .upsert(
            {
              play_date: playDate,
              artist_name: finalArtistName,
              artist_image_url: finalImageUrl,
              track_pool: finalTracks,
              all_searchable_titles: finalTitles
            },
            { onConflict: 'play_date' }
          );
      }
    } catch (dbErr) {
      console.warn('Supabase sync skipped/failed (using local store):', dbErr);
    }

    return NextResponse.json({ success: true, challenge: savedLocal });
  } catch (error: any) {
    console.error('Error in generate-daily route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
