import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchArtistDiscography } from '@/lib/music';

// Secret to protect this cron endpoint
const CRON_SECRET = process.env.CRON_SECRET || 'secret';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { artistName, playDate, customPool, customTitles, customImage } = await request.json();
    if (!artistName || !playDate) {
      return NextResponse.json({ error: 'Missing artistName or playDate' }, { status: 400 });
    }

    let finalArtistName = artistName;
    let finalImageUrl = customImage || '';
    let finalTracks = customPool || [];
    let finalTitles = customTitles || [];

    // If they didn't provide a custom pool from the dashboard, fetch it automatically
    if (!customPool || customPool.length === 0) {
      const { artistName: fetchedArtistName, artistImageUrl, targetTracks, allTitles } = await fetchArtistDiscography(artistName);
      finalArtistName = fetchedArtistName;
      finalImageUrl = artistImageUrl;
      finalTracks = targetTracks;
      finalTitles = allTitles;
    }

    const { data, error } = await supabase
      .from('daily_challenges')
      .insert([
        {
          play_date: playDate,
          artist_name: finalArtistName,
          artist_image_url: finalImageUrl,
          track_pool: finalTracks,
          all_searchable_titles: finalTitles
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, challenge: data });
  } catch (error: any) {
    console.error('Error generating daily challenge:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
