export interface Track {
  id: string;
  title: string;
  preview_url: string;
  slice_offset_sec: number;
  album?: string;
  year?: string | number;
  artwork_url?: string;
}

export function cleanTrackTitle(title: string): string {
  return title
    .replace(/\s*\(.*?(Remaster|Radio Edit|feat\.|Edition|Bonus|Mix|Version).*?\)/gi, '')
    .replace(/\s*\[.*?(Remaster|Radio Edit|feat\.|Edition|Bonus|Mix|Version).*?\]/gi, '')
    .replace(/\s*-.*?(Remaster|Radio Edit|Mix|Version|Edit)/gi, '')
    .trim();
}

// Fetches artist discography via Deezer (real artist photos, up-to-date catalog, free).
// Called server-side only (no CORS issues).
export async function fetchArtistDiscography(artistName: string) {
  const DEEZER_BASE = 'https://api.deezer.com';

  // 1. Artist info for real profile photo
  const artistRes = await fetch(
    `${DEEZER_BASE}/search/artist?q=${encodeURIComponent(artistName)}&limit=1`
  );
  const artistData = await artistRes.json();
  const artistInfo = artistData.data?.[0] ?? null;

  // 2. Paginate tracks (2 pages × 100 = up to 200)
  const [page1, page2] = await Promise.all([
    fetch(`${DEEZER_BASE}/search?q=artist:"${encodeURIComponent(artistName)}"&limit=100&index=0`).then(r => r.json()),
    fetch(`${DEEZER_BASE}/search?q=artist:"${encodeURIComponent(artistName)}"&limit=100&index=100`).then(r => r.json()),
  ]);

  const allRaw: any[] = [...(page1.data ?? []), ...(page2.data ?? [])];

  if (allRaw.length === 0) {
    throw new Error(`Artist "${artistName}" not found on Deezer`);
  }

  // 3. Filter: must have a 30s preview
  const withPreview = allRaw.filter(t => t.preview);

  // 4. Deduplicate + clean titles
  const uniqueMap = new Map<string, Track>();
  for (const t of withPreview) {
    const cleanTitle = cleanTrackTitle(t.title_short ?? t.title ?? '');
    if (!uniqueMap.has(cleanTitle)) {
      uniqueMap.set(cleanTitle, {
        id: `deezer-${t.id}`,
        title: cleanTitle,
        preview_url: t.preview,
        slice_offset_sec: 0,
        album: t.album?.title ?? 'Unknown Album',
        year: t.release_date ? t.release_date.substring(0, 4) : 'Unknown',
        artwork_url: t.album?.cover_xl ?? t.album?.cover_big ?? t.album?.cover ?? '',
      });
    }
  }

  const allTracks = Array.from(uniqueMap.values());

  if (allTracks.length < 5) {
    throw new Error('Not enough tracks found for this artist');
  }

  // 5. Take top 50 shuffled as the game pool
  const top50 = allTracks.slice(0, 50);
  const targetTracks = [...top50].sort(() => 0.5 - Math.random()).slice(0, 50);

  // 6. Artist image: real Deezer photo > first album cover
  const artistImageUrl =
    artistInfo?.picture_xl ??
    artistInfo?.picture_big ??
    artistInfo?.picture ??
    allTracks[0]?.artwork_url ??
    '';

  const actualArtistName =
    artistInfo?.name ??
    allRaw.find(r => r.artist?.name?.toLowerCase() === artistName.toLowerCase())?.artist?.name ??
    artistName;

  return {
    artistName: actualArtistName,
    artistImageUrl,
    targetTracks,
    allTitles: top50.map(t => t.title),
  };
}
