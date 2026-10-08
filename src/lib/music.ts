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

// Fetches artist discography via Deezer using the exact artist ID.
export async function fetchArtistDiscography(artistName: string) {
  const DEEZER_BASE = 'https://api.deezer.com';

  // 1. Resolve artist ID with exact/closest match
  const artistRes = await fetch(
    `${DEEZER_BASE}/search/artist?q=${encodeURIComponent(artistName)}&limit=10`
  );
  const artistData = await artistRes.json();
  const artistsList: any[] = artistData.data || [];

  if (artistsList.length === 0) {
    throw new Error(`Artist "${artistName}" not found on Deezer`);
  }

  const matchedArtist =
    artistsList.find(a => a.name.toLowerCase() === artistName.toLowerCase()) ||
    artistsList[0];

  const artistId = matchedArtist.id;
  const actualArtistName = matchedArtist.name;
  const artistImageUrl =
    matchedArtist.picture_xl ||
    matchedArtist.picture_big ||
    matchedArtist.picture_medium ||
    '';

  // 2. Fetch top tracks and albums directly by artist ID
  const [topTracksRes, albumsRes] = await Promise.all([
    fetch(`${DEEZER_BASE}/artist/${artistId}/top?limit=100`).then(r => r.json()),
    fetch(`${DEEZER_BASE}/artist/${artistId}/albums?limit=20`).then(r => r.json()),
  ]);

  const topTracks: any[] = topTracksRes.data || [];
  const albums: any[] = albumsRes.data || [];

  const albumTrackRequests = albums.slice(0, 10).map(alb =>
    fetch(`${DEEZER_BASE}/album/${alb.id}/tracks`)
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
  const allTracksRaw = [...topTracks, ...albumTracksList];

  // 3. Deduplicate and clean titles
  const uniqueMap = new Map<string, Track>();
  for (const t of allTracksRaw) {
    if (!t.preview) continue;
    const cleanTitle = cleanTrackTitle(t.title_short || t.title || '');
    if (!cleanTitle) continue;

    if (!uniqueMap.has(cleanTitle)) {
      uniqueMap.set(cleanTitle, {
        id: `deezer-${t.id}`,
        title: cleanTitle,
        preview_url: t.preview,
        slice_offset_sec: 0,
        album: t.album?.title || 'Unknown Album',
        year: t.release_date ? t.release_date.substring(0, 4) : 'Unknown',
        artwork_url: t.album?.cover_xl || t.album?.cover_big || artistImageUrl,
      });
    }
  }

  const allTracks = Array.from(uniqueMap.values());

  if (allTracks.length < 5) {
    throw new Error('Not enough tracks found for this artist');
  }

  const top50 = allTracks.slice(0, 50);
  const targetTracks = [...top50].sort(() => 0.5 - Math.random()).slice(0, 50);

  return {
    artistName: actualArtistName,
    artistImageUrl,
    targetTracks,
    allTitles: top50.map(t => t.title),
  };
}
