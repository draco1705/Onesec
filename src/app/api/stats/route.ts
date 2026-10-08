import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getChallengeByDate, getActiveChallenge, recordSubmission, getSubmissionsStats } from '@/lib/db';
import { verifySessionToken } from '@/lib/crypto';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  try {
    const challenge = (date ? getChallengeByDate(date) : null) || getActiveChallenge();

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const { distribution, total } = getSubmissionsStats(challenge.id);

    return NextResponse.json({
      artist_name: challenge.artist_name,
      distribution,
      total,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { date, score, totalTimeMs, sessionToken, challengeId } = await request.json();

    if (!sessionToken || !challengeId) {
      return NextResponse.json({ error: 'Missing session token or challenge ID' }, { status: 400 });
    }

    // Verify cryptographic signature and start time
    const startMs = verifySessionToken(sessionToken, challengeId);
    const elapsedServerMs = Date.now() - startMs;

    if (elapsedServerMs < 3000) {
      return NextResponse.json({ error: 'Implausible completion time. Run rejected.' }, { status: 403 });
    }

    // HTTP-only cookie check to prevent double submissions for the same challenge
    const cookieStore = await cookies();
    const submissionKey = `submitted_${challengeId}`;
    if (cookieStore.get(submissionKey)) {
      return NextResponse.json({ error: 'Already submitted today.' }, { status: 403 });
    }

    // Record submission in SQLite database
    recordSubmission(challengeId, score, totalTimeMs);

    // Also sync to Supabase if available
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('dummy')) {
        await supabase
          .from('daily_submissions')
          .insert([{ challenge_id: challengeId, score, total_time_ms: totalTimeMs }]);
      }
    } catch {
      // Supabase is optional
    }

    cookieStore.set(submissionKey, 'true', { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
