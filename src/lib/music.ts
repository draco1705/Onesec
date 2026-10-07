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

export async function fetchArtistDiscography(artistName: string) {
  const url1 = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=200`;
  const url2 = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName + ' feat')}&entity=song&limit=200`;
  
  const [res1, res2] = await Promise.all([fetch(url1), fetch(url2)]);
  const data1 = await res1.json();
  const data2 = await res2.json();

  const combinedResults = [...(data1.results || []), ...(data2.results || [])];

  if (combinedResults.length === 0) {
    throw new Error('Artist not found');
  }

  // Create a combined data object to mimic the original structure
  const data = { results: combinedResults };

  // Filter out songs without previews
  const validTracks = data.results.filter((track: { previewUrl?: string; trackName?: string; trackId?: number; collectionName?: string; releaseDate?: string; artworkUrl100?: string }) => track.previewUrl);
  
  // Group by clean title to avoid duplicates
  const uniqueTracksMap = new Map<string, Track>();
  for (const track of validTracks) {
    const cleanTitle = cleanTrackTitle(track.trackName);
    if (!uniqueTracksMap.has(cleanTitle)) {
      uniqueTracksMap.set(cleanTitle, {
        id: track.trackId.toString(),
        title: cleanTitle,
        preview_url: track.previewUrl,
        slice_offset_sec: 0,
        album: track.collectionName || 'Unknown Album',
        year: track.releaseDate ? new Date(track.releaseDate).getFullYear() : 'Unknown',
        artwork_url: track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : ''
      });
    }
  }

  const allTracks = Array.from(uniqueTracksMap.values());
  
  // Need at least 5 tracks for the game
  if (allTracks.length < 5) {
    throw new Error('Not enough tracks found for this artist');
  }

  // Sort by popularity or just take the first 50 (iTunes returns most relevant/popular first usually)
  const top50 = allTracks.slice(0, 50);
  
  // Pick all up to 50 random tracks for the target pool
  const shuffled = [...top50].sort(() => 0.5 - Math.random());
  const targetTracks = shuffled.slice(0, 50);

  // iTunes returns album artwork. Let's use the first track's artwork as the artist image
  // and upgrade the resolution from 100x100 to 600x600.
  const baseArtworkUrl = data.results[0].artworkUrl100 || '';
  const artistImageUrl = baseArtworkUrl.replace('100x100bb', '600x600bb');

  const actualArtistName = data.results.find((r: { artistName: string }) => r.artistName.toLowerCase() === artistName.toLowerCase())?.artistName || artistName;

  return {
    artistName: actualArtistName,
    artistImageUrl,
    targetTracks,
    allTitles: top50.map(t => t.title)
  };
}
