import { NextResponse } from 'next/server';
import { decryptUrl } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// In-memory cache for refreshed Deezer preview URLs (keyed by numeric track id)
const previewUrlCache = new Map<string, { url: string; expires: number }>();

async function getFreshDeezerPreview(numericId: string): Promise<string | null> {
  const cached = previewUrlCache.get(numericId);
  if (cached && Date.now() < cached.expires) {
    return cached.url;
  }

  try {
    const res = await fetch(`https://api.deezer.com/track/${numericId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.preview) {
      previewUrlCache.set(numericId, {
        url: data.preview,
        // Cache for 10 minutes
        expires: Date.now() + 10 * 60 * 1000,
      });
      return data.preview;
    }
  } catch (e) {
    console.warn(`Failed to refresh Deezer preview for track ${numericId}:`, e);
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const trackId = searchParams.get('id');

  if (!token && !trackId) {
    return new NextResponse('Missing token or track ID', { status: 400 });
  }

  try {
    let rawUrl = '';
    if (token) {
      try {
        rawUrl = decryptUrl(token);
      } catch (decryptErr) {
        console.warn('Audio token decrypt failed, falling back to trackId:', decryptErr);
      }
    }

    let audioRes: Response | null = null;

    // 1. Try fetching original URL if present and looks like a valid URL
    if (rawUrl && rawUrl.startsWith('http')) {
      try {
        audioRes = await fetch(rawUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'audio/*, */*',
          },
        });
      } catch (fetchErr) {
        console.warn('Initial audio fetch error:', fetchErr);
      }
    }

    // 2. If initial fetch was forbidden (expired Deezer token) or failed:
    if (!audioRes || !audioRes.ok || audioRes.status === 403) {
      let numericId: string | null = null;

      if (trackId) {
        const match = trackId.match(/(\d{4,})/);
        if (match) numericId = match[1];
      }

      if (!numericId && rawUrl) {
        const match = rawUrl.match(/\/track\/(\d+)/);
        if (match) numericId = match[1];
      }

      if (numericId) {
        const freshUrl = await getFreshDeezerPreview(numericId);
        if (freshUrl) {
          try {
            audioRes = await fetch(freshUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'audio/*, */*',
              },
            });
          } catch (freshFetchErr) {
            console.warn('Fresh Deezer audio fetch error:', freshFetchErr);
          }
        }
      }
    }

    if (!audioRes || !audioRes.ok) {
      return new NextResponse('Failed to fetch audio stream', { status: audioRes?.status || 404 });
    }

    const buffer = await audioRes.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=1800',
      },
    });
  } catch (error: any) {
    console.error('Audio proxy error:', error);
    return new NextResponse('Internal audio error', { status: 500 });
  }
}
