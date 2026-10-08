import { NextResponse } from 'next/server';
import { setActiveChallenge, getChallengeById, setActiveArtist, getAllChallenges, saveChallenge, deleteChallenge } from '@/lib/db';
import { fetchArtistDiscography } from '@/lib/music';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { challengeId, artistName } = await request.json();

    if (challengeId) {
      const updated = setActiveChallenge(challengeId);
      if (!updated) {
        return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, challenge: updated });
    }

    if (artistName) {
      // Check if challenge exists for this artist
      const existing = getAllChallenges().find(
        c => !c.is_draft && c.artist_name.toLowerCase().trim() === artistName.toLowerCase().trim()
      );

      if (existing) {
        const activated = setActiveChallenge(existing.id);
        return NextResponse.json({ success: true, challenge: activated });
      }

      // Fetch and save
      const todayStr = new Date().toISOString().split('T')[0];
      const { artistName: fetchedName, artistImageUrl, targetTracks, allTitles } = await fetchArtistDiscography(artistName);

      const created = saveChallenge({
        play_date: todayStr,
        artist_name: fetchedName,
        artist_image_url: artistImageUrl,
        track_pool: targetTracks,
        all_searchable_titles: allTitles,
        is_draft: false,
      }, true);

      setActiveChallenge(created.id);
      setActiveArtist(created.artist_name);

      return NextResponse.json({ success: true, challenge: created });
    }

    return NextResponse.json({ error: 'Missing challengeId or artistName' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in set-active route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing challenge id' }, { status: 400 });
    }
    const success = deleteChallenge(id);
    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
