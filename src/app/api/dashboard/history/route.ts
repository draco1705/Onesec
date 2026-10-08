import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAllStoredChallenges } from '@/lib/challenges-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Get from local challenges store
    const localChallenges = getAllStoredChallenges();

    // 2. Try Supabase if configured
    let dbChallenges: any[] = [];
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('dummy')) {
        const { data, error } = await supabase
          .from('daily_challenges')
          .select('play_date, artist_name, artist_image_url')
          .order('play_date', { ascending: false })
          .limit(20);
        if (!error && data) dbChallenges = data;
      }
    } catch (e) {
      // ignore
    }

    // Merge without duplicates by play_date
    const map = new Map<string, any>();
    localChallenges.forEach(c => {
      map.set(c.play_date, {
        id: c.id,
        play_date: c.play_date,
        artist_name: c.artist_name,
        artist_image_url: c.artist_image_url,
        is_draft: c.is_draft,
      });
    });
    dbChallenges.forEach(c => {
      if (!map.has(c.play_date)) {
        map.set(c.play_date, c);
      }
    });

    const result = Array.from(map.values()).sort((a, b) => b.play_date.localeCompare(a.play_date));
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
