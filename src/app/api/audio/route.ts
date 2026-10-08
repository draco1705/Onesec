import { NextResponse } from 'next/server';
import { decryptUrl } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  
  if (!token) {
    return new NextResponse('Missing token', { status: 400 });
  }

  try {
    const rawUrl = decryptUrl(token);
    
    const audioRes = await fetch(rawUrl);
    if (!audioRes.ok) throw new Error('Failed to fetch audio from source');

    const buffer = await audioRes.arrayBuffer();

    // Stream the raw bytes, discarding iTunes/original headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=60',
      }
    });
  } catch (error) {
    return new NextResponse('Invalid or expired audio token', { status: 403 });
  }
}
