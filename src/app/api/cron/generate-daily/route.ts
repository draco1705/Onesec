import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchArtistDiscography } from '@/lib/music';
import { saveChallenge, setActiveChallenge } from '@/lib/db';

const CRON_SECRET = process.env.CRON_SECRET || 'secret';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { artistName, playDate, customPool, customTitles, customImage, isDraft, makeActive } = await request.json();
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

    // Resolve missing or broken example.com image URL
    if (!finalImageUrl || finalImageUrl.includes('example.com')) {
      try {
        const artistRes = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(finalArtistName)}&limit=1`);
        const artistData = await artistRes.json();
        if (artistData?.data?.[0]?.picture_xl || artistData?.data?.[0]?.picture_big) {
          finalImageUrl = artistData.data[0].picture_xl || artistData.data[0].picture_big;
        }
      } catch (imgErr) {
        console.warn('Deezer image fetch warning:', imgErr);
      }
      if (!finalImageUrl && finalTracks[0]?.artwork_url) {
        finalImageUrl = finalTracks[0].artwork_url;
      }
    }

    const shouldMakeActive = !isDraft && (makeActive !== undefined ? !!makeActive : true);

    // Save to SQLite / persistent database
    const savedLocal = saveChallenge(
      {
        play_date: playDate,
        artist_name: finalArtistName,
        artist_image_url: finalImageUrl,
        track_pool: finalTracks,
        all_searchable_titles: finalTitles,
        is_draft: !!isDraft,
      },
      shouldMakeActive
    );

    if (shouldMakeActive) {
      setActiveChallenge(savedLocal.id);
    }

    // Optionally sync to Supabase if available
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
              all_searchable_titles: finalTitles,
            },
            { onConflict: 'play_date' }
          );
      }
    } catch (dbErr) {
      console.warn('Supabase sync skipped/failed:', dbErr);
    }

    return NextResponse.json({ success: true, challenge: savedLocal });
  } catch (error: any) {
    console.error('Error in generate-daily route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
