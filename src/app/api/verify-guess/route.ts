import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchArtistDiscography } from '@/lib/music';
import { getStoredChallengeByDate, getLatestActiveChallenge } from '@/lib/challenges-store';
import { decryptTrackData } from '@/lib/crypto';

export async function POST(request: Request) {
  try {
    const { date, trackId, guess, testArtist, answerToken } = await request.json();

    if (!trackId || guess === undefined) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. If an answerToken was provided from the challenge, decrypt it directly
    if (answerToken) {
      try {
        const meta = decryptTrackData(answerToken);
        const isCorrect = meta.title.toLowerCase().trim() === guess.toLowerCase().trim();
        return NextResponse.json({
          isCorrect,
          actualTitle: meta.title,
          album: meta.album || 'Unknown Album',
          year: meta.year || 'Unknown Year',
          sliceStart: meta.slice_offset_sec ?? 0,
          artwork_url: meta.artwork_url || '',
        });
      } catch (e) {
        console.warn('answerToken decrypt failed, falling back to lookup:', e);
      }
    }

    // 2. Fallback to challenge lookup by date/testArtist
    let targetTracks: any[] = [];

    if (testArtist) {
      const { targetTracks: fetchedTracks } = await fetchArtistDiscography(testArtist);
      targetTracks = fetchedTracks;
    } else {
      const stored = (date ? getStoredChallengeByDate(date) : null) || getLatestActiveChallenge();
      if (stored) {
        targetTracks = stored.track_pool;
      } else {
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

    const track = targetTracks.find((t: any) => t.id === trackId);

    if (track) {
      const isCorrect = track.title.toLowerCase().trim() === guess.toLowerCase().trim();
      return NextResponse.json({
        isCorrect,
        actualTitle: track.title,
        album: track.album || 'Unknown Album',
        year: track.year || 'Unknown Year',
        sliceStart: track.slice_offset_sec ?? 0,
        artwork_url: track.artwork_url || '',
      });
    }

    // If still not found, return a fallback so the game never displays 'undefined'
    return NextResponse.json({
      isCorrect: false,
      actualTitle: 'Unknown Track',
      album: 'Unknown Album',
      year: 'Unknown Year',
      sliceStart: 0,
      artwork_url: '',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
