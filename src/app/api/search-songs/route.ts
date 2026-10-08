import { NextResponse } from 'next/server';

// Deezer API proxy
// 1. Searches artist by name and finds the exact or closest matching artist.
// 2. Fetches their top tracks, album tracks, AND tracks where they are featured.

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
    const verifiedArtistName = matchedArtist.name;
    const artistImageUrl =
      matchedArtist.picture_xl ||
      matchedArtist.picture_big ||
      matchedArtist.picture_medium ||
      '';

    // 2. Fetch artist top tracks, albums, AND featured tracks in parallel
    const [topTracksRes, albumsRes, featSearchRes1, featSearchRes2] = await Promise.all([
      fetch(`${DEEZER_BASE}/artist/${artistId}/top?limit=100`, { next: { revalidate: 3600 } }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${DEEZER_BASE}/artist/${artistId}/albums?limit=25`, { next: { revalidate: 3600 } }).then(r => r.json()).catch(() => ({ data: [] })),
      // Search for songs containing artist name (catches "Song Title (feat. Artist)")
      fetch(`${DEEZER_BASE}/search?q=${encodeURIComponent(verifiedArtistName + ' feat')}&limit=100`, { next: { revalidate: 3600 } }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${DEEZER_BASE}/search?q=${encodeURIComponent(verifiedArtistName)}&limit=100`, { next: { revalidate: 3600 } }).then(r => r.json()).catch(() => ({ data: [] })),
    ]);

    const topTracks: any[] = topTracksRes.data || [];
    const albums: any[] = albumsRes.data || [];

    // 3. For the top albums, fetch their tracks
    const albumTrackRequests = albums.slice(0, 10).map(alb =>
      fetch(`${DEEZER_BASE}/album/${alb.id}/tracks`, { next: { revalidate: 3600 } })
        .then(r => r.json())
        .then(res => {
          const list = res.data || [];
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

    // 4. Filter featured tracks: ensure they actually feature the artist
    const queryLower = verifiedArtistName.toLowerCase();
    const rawFeatTracks = [...(featSearchRes1.data || []), ...(featSearchRes2.data || [])];
    const validFeatTracks = rawFeatTracks.filter(t => {
      const titleLower = (t.title || '').toLowerCase();
      const artistLower = (t.artist?.name || '').toLowerCase();
      return (
        artistLower === queryLower ||
        titleLower.includes(queryLower) ||
        (t.contributors && t.contributors.some((c: any) => c.name?.toLowerCase() === queryLower))
      );
    });

    // 5. Combine everything
    const allTracksRaw = [...topTracks, ...albumTracksList, ...validFeatTracks];

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
        artistName: t.artist?.name || verifiedArtistName,
        collectionName: t.album?.title || 'Single / Feature',
        releaseDate: t.release_date || null,
        artworkUrl: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || artistImageUrl,
        previewUrl: t.preview,
        durationSec: t.duration || 30,
        primaryGenreName: 'Deezer',
      });
    }

    if (uniqueTracks.length === 0) {
      return NextResponse.json({ error: `No playable tracks found for "${verifiedArtistName}"` }, { status: 404 });
    }

    return NextResponse.json({
      artistName: verifiedArtistName,
      artistImageUrl,
      tracks: uniqueTracks,
    });
  } catch (err: any) {
    console.error('[search-songs] Deezer error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
