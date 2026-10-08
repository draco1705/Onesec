import { NextResponse } from 'next/server';

// Deezer API proxy — avoids CORS and keeps API calls server-side.
// Deezer is free, no auth required, and returns real artist photos + up-to-date catalogs.

const DEEZER_BASE = 'https://api.deezer.com';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get('artist')?.trim();
  const limitParam = parseInt(searchParams.get('limit') || '200', 10);

  if (!artist) {
    return NextResponse.json({ error: 'Missing artist parameter' }, { status: 400 });
  }

  try {
    // 1. Fetch artist info (real profile picture)
    const artistRes = await fetch(
      `${DEEZER_BASE}/search/artist?q=${encodeURIComponent(artist)}&limit=1`,
      { next: { revalidate: 3600 } }
    );
    const artistData = await artistRes.json();
    const artistInfo = artistData.data?.[0] ?? null;

    // 2. Fetch tracks — paginate up to `limitParam` (max 100 per Deezer page)
    const perPage = 100;
    const pages = Math.ceil(Math.min(limitParam, 200) / perPage);

    const pageRequests = Array.from({ length: pages }, (_, i) =>
      fetch(
        `${DEEZER_BASE}/search?q=artist:"${encodeURIComponent(artist)}"&limit=${perPage}&index=${i * perPage}`,
        { next: { revalidate: 3600 } }
      ).then(r => r.json())
    );

    const pageResults = await Promise.all(pageRequests);

    const allTracks: any[] = [];
    for (const page of pageResults) {
      if (page.data) allTracks.push(...page.data);
    }

    if (allTracks.length === 0) {
      return NextResponse.json({ error: 'Artist not found on Deezer' }, { status: 404 });
    }

    // 3. Filter tracks with previews + deduplicate by title
    const withPreview = allTracks.filter(t => t.preview);
    const seen = new Set<string>();
    const unique = withPreview.filter(t => {
      const key = t.title_short?.toLowerCase().trim() ?? t.title?.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 4. Normalise to a clean shape
    const tracks = unique.map(t => ({
      trackId: `deezer-${t.id}`,
      trackName: t.title_short ?? t.title,
      artistName: t.artist?.name ?? artist,
      collectionName: t.album?.title ?? 'Unknown Album',
      releaseDate: t.release_date ?? null,   // YYYY-MM-DD
      artworkUrl: t.album?.cover_xl ?? t.album?.cover_big ?? t.album?.cover ?? '',
      previewUrl: t.preview,                 // 30s MP3
      durationSec: t.duration ?? 30,
      primaryGenreName: 'Deezer',
    }));

    // 5. Artist image: prefer Deezer artist photo, fallback to first album cover
    const artistImageUrl =
      artistInfo?.picture_xl ??
      artistInfo?.picture_big ??
      artistInfo?.picture ??
      tracks[0]?.artworkUrl ??
      '';

    return NextResponse.json({
      artistName: artistInfo?.name ?? tracks[0]?.artistName ?? artist,
      artistImageUrl,
      tracks,
    });
  } catch (err: any) {
    console.error('[search-songs] Deezer error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
