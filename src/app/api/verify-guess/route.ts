import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchArtistDiscography } from '@/lib/music';

// Need to match the testCache from daily route, but this is a separate request.
// For test mode, we'll just re-fetch or use a simplified check if the artist name is passed.
// To keep it simple, we can pass the actual title encrypted or just fetch again.
// Let's modify the client to send the artist name if in test mode.

export async function POST(request: Request) {
  try {
    const { date, trackId, guess, testArtist } = await request.json();

    if (!trackId || guess === undefined) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    let targetTracks = [];

    if (testArtist) {
       const { targetTracks: fetchedTracks } = await fetchArtistDiscography(testArtist);
       targetTracks = fetchedTracks;
    } else {
      const { data: challenge, error } = await supabase
        .from('daily_challenges')
        .select('track_pool')
        .eq('play_date', date)
        .single();

      if (error || !challenge) {
        return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
      }
      targetTracks = challenge.track_pool;
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
