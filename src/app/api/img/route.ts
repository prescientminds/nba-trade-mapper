// Image proxy — serves external images with CORS headers so html-to-image can inline them.
export const runtime = 'edge';

const ALLOWED_HOSTS = ['cdn.nba.com', 'cdn.wnba.com', 'www.basketball-reference.com'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');
  if (!target) return new Response('Missing url', { status: 400 });

  try {
    const u = new URL(target);
    if (!ALLOWED_HOSTS.includes(u.hostname)) {
      return new Response('Host not allowed', { status: 403 });
    }
  } catch {
    return new Response('Invalid url', { status: 400 });
  }

  const res = await fetch(target);
  if (!res.ok) return new Response('Upstream error', { status: 502 });

  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') || 'image/png',
      'Cache-Control': 'public, max-age=604800',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
