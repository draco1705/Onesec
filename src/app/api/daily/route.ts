import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchArtistDiscography } from '@/lib/music';
import { encryptUrl, encryptTrackData } from '@/lib/crypto';
import {
  getActiveChallenge,
  getChallengeByDate,
  saveChallenge,
  getActiveArtist,
  setActiveArtist,
  getAllChallenges,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

function formatSafeChallenge(challengeData: any) {
  const safeTrackPool = challengeData.track_pool.map((track: any) => {
    const isLocal = track.preview_url?.startsWith('/songs/') || track.preview_url?.startsWith('/public/');
    const safeUrl = isLocal
      ? track.preview_url
      : `/api/audio?token=${encodeURIComponent(encryptUrl(track.preview_url))}`;

    const answerToken = encryptTrackData({
      title: track.title,
      album: track.album || 'Unknown Album',
      year: track.year || 'Unknown Year',
      artwork_url: track.artwork_url || challengeData.artist_image_url || '',
      slice_offset_sec: track.slice_offset_sec ?? 0,
    });

    return {
      id: track.id,
      preview_url: safeUrl,
      slice_offset_sec: track.slice_offset_sec,
      artwork_url: track.artwork_url,
      answer_token: answerToken,
    };
  });

  return {
    id: challengeData.id,
    play_date: challengeData.play_date,
    artist_name: challengeData.artist_name,
    artist_image_url: challengeData.artist_image_url,
    track_pool: safeTrackPool,
    all_searchable_titles: challengeData.all_searchable_titles,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const artistParam = searchParams.get('artist');
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    let challengeData: any = null;

    // 1. If a specific artist is requested via query param
    if (artistParam) {
      // Check if we already have a non-draft challenge for this artist in SQLite
      const existing = getAllChallenges().find(
        c => !c.is_draft && c.artist_name.toLowerCase().trim() === artistParam.toLowerCase().trim()
      );

      if (existing) {
        challengeData = existing;
      } else {
        // Fetch discography and save to DB
        const { artistName, artistImageUrl, targetTracks, allTitles } = await fetchArtistDiscography(artistParam);
        challengeData = saveChallenge({
          play_date: date || todayStr,
          artist_name: artistName,
          artist_image_url: artistImageUrl,
          track_pool: targetTracks,
          all_searchable_titles: allTitles,
          is_draft: false,
        }, true);
      }
      setActiveArtist(challengeData.artist_name);
    }

    // 2. If no specific artist requested: load active challenge from SQLite database
    if (!challengeData) {
      challengeData = getActiveChallenge();
    }

    // 3. If still no challenge and date requested matches a specific stored challenge
    if (!challengeData && date) {
      const stored = getChallengeByDate(date);
      if (stored) {
        challengeData = stored;
      }
    }

    // 4. Try Supabase as secondary source if configured
    if (!challengeData && date) {
      try {
        if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('dummy')) {
          const { data, error } = await supabase
            .from('daily_challenges')
            .select('id, play_date, artist_name, artist_image_url, track_pool, all_searchable_titles')
            .eq('play_date', date)
            .single();

          if (!error && data) {
            challengeData = saveChallenge({
              id: data.id,
              play_date: data.play_date,
              artist_name: data.artist_name,
              artist_image_url: data.artist_image_url,
              track_pool: data.track_pool,
              all_searchable_titles: data.all_searchable_titles,
              is_draft: false,
            }, true);
          }
        }
      } catch (dbErr) {
        console.warn('Supabase query failed:', dbErr);
      }
    }

    // 5. Fallback: auto-generate for the DB's active artist
    if (!challengeData) {
      const activeArtist = getActiveArtist() || 'Wxrdie';
      const { artistName, artistImageUrl, targetTracks, allTitles } = await fetchArtistDiscography(activeArtist);

      challengeData = saveChallenge({
        play_date: date || todayStr,
        artist_name: artistName,
        artist_image_url: artistImageUrl,
        track_pool: targetTracks,
        all_searchable_titles: allTitles,
        is_draft: false,
      }, true);
    }

    const payload = formatSafeChallenge(challengeData);
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error: any) {
    console.error('Error in /api/daily:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
