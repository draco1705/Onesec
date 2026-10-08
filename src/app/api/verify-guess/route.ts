import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchArtistDiscography } from '@/lib/music';
import { getStoredChallengeByDate } from '@/lib/challenges-store';

export async function POST(request: Request) {
  try {
    const { date, trackId, guess, testArtist } = await request.json();

    if (!trackId || guess === undefined) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    let targetTracks: any[] = [];

    if (testArtist) {
      const { targetTracks: fetchedTracks } = await fetchArtistDiscography(testArtist);
      targetTracks = fetchedTracks;
    } else {
      // 1. Check local store first
      const stored = getStoredChallengeByDate(date);
      if (stored) {
        targetTracks = stored.track_pool;
      } else {
        // 2. Fall back to Supabase
        try {
          if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('dummy')) {
            const { data: challenge, error } = await supabase
              .from('daily_challenges')
              .select('track_pool')
              .eq('play_date', date)
              .single();

            if (!error && challenge) {
              targetTracks = challenge.track_pool;
            }
          }
        } catch (dbErr) {
          console.warn('Supabase verify-guess query failed:', dbErr);
        }
      }
    }

    if (!targetTracks || targetTracks.length === 0) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const track = targetTracks.find((t: any) => t.id === trackId);

    if (!track) {
      return NextResponse.json({ error: 'Track not found in challenge' }, { status: 404 });
    }

    const isCorrect = track.title.toLowerCase() === guess.toLowerCase();

    return NextResponse.json({
      isCorrect,
      actualTitle: track.title,
      album: track.album || 'Unknown Album',
      year: track.year || 'Unknown Year',
      sliceStart: track.slice_offset_sec,
      artwork_url: track.artwork_url
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
