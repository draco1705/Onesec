import { NextResponse } from 'next/server';
import { getAllChallenges, getActiveChallenge } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const localChallenges = getAllChallenges();
    const active = getActiveChallenge();

    const result = localChallenges.map(c => ({
      id: c.id,
      play_date: c.play_date,
      artist_name: c.artist_name,
      artist_image_url: c.artist_image_url,
      is_draft: c.is_draft,
      is_active: active ? active.id === c.id : c.is_active,
      track_count: c.track_pool?.length || 0,
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
