import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchArtistDiscography } from '@/lib/music';
import { encryptUrl, encryptTrackData } from '@/lib/crypto';
import { getStoredChallengeByDate, getLatestActiveChallenge } from '@/lib/challenges-store';

// In-memory cache for test queries
const testCache = new Map<string, any>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const testArtist = searchParams.get('artist');

  try {
    let challengeData: any = null;

    // 1. If date provided, check stored challenges for that date first
    if (date) {
      const stored = getStoredChallengeByDate(date);
      if (stored) {
        challengeData = stored;
      }
    }

    // 2. If no challenge found for exact date, check if there is any active challenge in store
    if (!challengeData && !testArtist) {
      const latest = getLatestActiveChallenge();
      if (latest) {
        challengeData = latest;
      }
    }

    // 3. Try Supabase if still not found
    if (!challengeData && !testArtist && date) {
      try {
        if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('dummy')) {
          const { data, error } = await supabase
            .from('daily_challenges')
            .select('id, play_date, artist_name, artist_image_url, track_pool, all_searchable_titles')
            .eq('play_date', date)
            .single();

          if (!error && data) {
            challengeData = data;
          }
        }
      } catch (dbErr) {
        console.warn('Supabase query failed:', dbErr);
      }
    }

    // If challenge found, return safe track pool
    if (challengeData) {
      const safeTrackPool = challengeData.track_pool.map((track: any) => {
        const isLocal = track.preview_url?.startsWith('/songs/') || track.preview_url?.startsWith('/public/');
        const safeUrl = isLocal
          ? track.preview_url
          : `/api/audio?token=${encodeURIComponent(encryptUrl(track.preview_url))}`;
        
        // Encrypt track answer metadata so verification never fails or says undefined
        const answerToken = encryptTrackData({
          title: track.title,
          album: track.album || 'Unknown Album',
          year: track.year || 'Unknown Year',
          artwork_url: track.artwork_url || challengeData.artist_image_url || '',
          slice_offset_sec: track.slice_offset_sec ?? 0
        });

        return {
          id: track.id,
          preview_url: safeUrl,
          slice_offset_sec: track.slice_offset_sec,
          artwork_url: track.artwork_url,
          answer_token: answerToken,
        };
      });

      return NextResponse.json({
        id: challengeData.id,
        play_date: challengeData.play_date,
        artist_name: challengeData.artist_name,
        artist_image_url: challengeData.artist_image_url,
        track_pool: safeTrackPool,
        all_searchable_titles: challengeData.all_searchable_titles
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        }
      });
    }

    // 4. FALLBACK: Auto-generate challenge via Deezer directly
    const fallbackArtist = testArtist || 'Wxrdie';

    if (testCache.has(fallbackArtist)) {
      return NextResponse.json(testCache.get(fallbackArtist));
    }

    const { artistName, artistImageUrl, targetTracks, allTitles } = await fetchArtistDiscography(fallbackArtist);

    const safeTrackPoolFallback = targetTracks.map((track: any) => {
      const answerToken = encryptTrackData({
        title: track.title,
        album: track.album || 'Unknown Album',
        year: track.year || 'Unknown Year',
        artwork_url: track.artwork_url || artistImageUrl,
        slice_offset_sec: track.slice_offset_sec ?? 0
      });

      return {
        id: track.id,
        preview_url: `/api/audio?token=${encodeURIComponent(encryptUrl(track.preview_url))}`,
        slice_offset_sec: track.slice_offset_sec,
        artwork_url: track.artwork_url,
        answer_token: answerToken,
      };
    });

    const fallbackChallenge = {
      id: 'fallback-challenge',
      play_date: date || new Date().toISOString().split('T')[0],
      artist_name: artistName,
      artist_image_url: artistImageUrl,
      track_pool: safeTrackPoolFallback,
      all_searchable_titles: allTitles
    };

    testCache.set(fallbackArtist, fallbackChallenge);
    return NextResponse.json(fallbackChallenge, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
