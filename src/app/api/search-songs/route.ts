import { NextResponse } from 'next/server';

// Deezer API proxy — queries by verified Artist ID to avoid global search pollution.
// 1. Searches artist by name and finds the exact / best matching artist ID.
// 2. Fetches their actual catalog using /artist/{id}/top and /artist/{id}/albums.

const DEEZER_BASE = 'https://api.deezer.com';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artistQuery = searchParams.get('artist')?.trim();

  if (!artistQuery) {
    return NextResponse.json({ error: 'Missing artist parameter' }, { status: 400 });
  }

  try {
    // 1. Find the exact / closest matching artist by name
    const artistRes = await fetch(
      `${DEEZER_BASE}/search/artist?q=${encodeURIComponent(artistQuery)}&limit=10`,
      { next: { revalidate: 3600 } }
    );
    const artistData = await artistRes.json();
    const artistsList: any[] = artistData.data || [];

    if (artistsList.length === 0) {
      return NextResponse.json({ error: `Artist "${artistQuery}" not found on Deezer` }, { status: 404 });
    }

    // Pick exact case-insensitive match if available, otherwise the top result
    const matchedArtist =
      artistsList.find(a => a.name.toLowerCase() === artistQuery.toLowerCase()) ||
      artistsList[0];

    const artistId = matchedArtist.id;
    const artistName = matchedArtist.name;
    const artistImageUrl =
      matchedArtist.picture_xl ||
      matchedArtist.picture_big ||
      matchedArtist.picture_medium ||
      '';

    // 2. Fetch artist's top tracks + albums directly by artist ID
    const [topTracksRes, albumsRes] = await Promise.all([
      fetch(`${DEEZER_BASE}/artist/${artistId}/top?limit=100`, { next: { revalidate: 3600 } }).then(r => r.json()),
      fetch(`${DEEZER_BASE}/artist/${artistId}/albums?limit=25`, { next: { revalidate: 3600 } }).then(r => r.json()),
    ]);

    const topTracks: any[] = topTracksRes.data || [];
    const albums: any[] = albumsRes.data || [];

    // 3. For the top albums, fetch their tracks to get a comprehensive discography
    const albumTrackRequests = albums.slice(0, 10).map(alb =>
      fetch(`${DEEZER_BASE}/album/${alb.id}/tracks`, { next: { revalidate: 3600 } })
        .then(r => r.json())
        .then(res => {
          const list = res.data || [];
          // Attach album artwork and album title to each track if missing
          return list.map((t: any) => ({
            ...t,
            album: {
              title: alb.title,
              cover_xl: alb.cover_xl || alb.cover_big || alb.cover_medium,
            },
            release_date: alb.release_date,
          }));
        })
        .catch(() => [])
    );

    const albumTracksList = (await Promise.all(albumTrackRequests)).flat();

    // 4. Combine top tracks and album tracks
    const allTracksRaw = [...topTracks, ...albumTracksList];

    // Filter tracks with preview and deduplicate by track title
    const seenTitles = new Set<string>();
    const uniqueTracks: any[] = [];

    for (const t of allTracksRaw) {
      if (!t.preview) continue;
      const cleanTitleKey = (t.title_short || t.title || '').toLowerCase().trim();
      if (!cleanTitleKey || seenTitles.has(cleanTitleKey)) continue;

      seenTitles.add(cleanTitleKey);
      uniqueTracks.push({
        trackId: `deezer-${t.id}`,
        trackName: t.title_short || t.title,
        artistName: t.artist?.name || artistName,
        collectionName: t.album?.title || 'Unknown Album',
        releaseDate: t.release_date || null,
        artworkUrl: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || artistImageUrl,
        previewUrl: t.preview,
        durationSec: t.duration || 30,
        primaryGenreName: 'Deezer',
      });
    }

    if (uniqueTracks.length === 0) {
      return NextResponse.json({ error: `No playable tracks found for "${artistName}"` }, { status: 404 });
    }

    return NextResponse.json({
      artistName,
      artistImageUrl,
      tracks: uniqueTracks,
    });
  } catch (err: any) {
    console.error('[search-songs] Deezer error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
