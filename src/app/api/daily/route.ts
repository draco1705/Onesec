import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchArtistDiscography } from '@/lib/music';
import { encryptUrl } from '@/lib/crypto';

// In-memory cache for testing so we don't spam iTunes
const testCache = new Map<string, any>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const testArtist = searchParams.get('artist'); // e.g. "Drake" or "Playboi Carti"
  
  try {
    if (testArtist) {
      if (testCache.has(testArtist)) {
        return NextResponse.json(testCache.get(testArtist));
      }
      
      const { artistName, artistImageUrl, targetTracks, allTitles } = await fetchArtistDiscography(testArtist);
      
      const safeTrackPool = targetTracks.map((track: any) => ({
        id: track.id,
        preview_url: `/api/audio?token=${encodeURIComponent(encryptUrl(track.preview_url))}`,
        slice_offset_sec: track.slice_offset_sec,
        artwork_url: track.artwork_url
      }));
      
      const challenge = {
        id: 'test-challenge',
        play_date: new Date().toISOString().split('T')[0],
        artist_name: artistName,
        artist_image_url: artistImageUrl,
        track_pool: safeTrackPool,
        all_searchable_titles: allTitles
      };
      
      testCache.set(testArtist, challenge);
      return NextResponse.json(challenge);
    }

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('daily_challenges')
      .select('id, play_date, artist_name, artist_image_url, track_pool, all_searchable_titles')
      .eq('play_date', date)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const safeTrackPool = data.track_pool.map((track: any) => ({
      id: track.id,
      preview_url: `/api/audio?token=${encodeURIComponent(encryptUrl(track.preview_url))}`,
      slice_offset_sec: track.slice_offset_sec,
      artwork_url: track.artwork_url
    }));

    return NextResponse.json({
      id: data.id,
      play_date: data.play_date,
      artist_name: data.artist_name,
      artist_image_url: data.artist_image_url,
      track_pool: safeTrackPool,
      all_searchable_titles: data.all_searchable_titles
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
