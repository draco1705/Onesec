import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artistQuery = searchParams.get('artist')?.toLowerCase() || '';

  try {
    const manifestPath = path.join(process.cwd(), 'public', 'songs', 'manifest.json');
    const raw = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);

    if (!artistQuery) {
      // Return list of all artists
      return NextResponse.json(
        manifest.artists.map((a: any) => ({
          name: a.name,
          image_url: a.image_url,
          song_count: a.songs.length
        }))
      );
    }

    // Find artist by name (fuzzy: contains)
    const artist = manifest.artists.find((a: any) =>
      a.name.toLowerCase().includes(artistQuery) ||
      artistQuery.includes(a.name.toLowerCase())
    );

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found in local library' }, { status: 404 });
    }

    return NextResponse.json({
      name: artist.name,
      image_url: artist.image_url,
      songs: artist.songs
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
