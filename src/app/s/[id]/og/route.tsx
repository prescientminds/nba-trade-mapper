import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

// Team colors lookup (subset for OG rendering — Edge runtime can't import the full module)
const TEAM_COLORS: Record<string, string> = {
  ATL: '#E03A3E', BOS: '#007A33', BKN: '#A1A1A4', CHA: '#00788C',
  CHI: '#CE1141', CLE: '#860038', DAL: '#00538C', DEN: '#FEC524',
  DET: '#C8102E', GSW: '#FFC72C', HOU: '#CE1141', IND: '#FDBB30',
  LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9', MIA: '#98002E',
  MIL: '#00471B', MIN: '#236192', NOP: '#C8102E', NYK: '#006BB6',
  OKC: '#007AC1', ORL: '#0077C0', PHI: '#006BB6', PHX: '#E56020',
  POR: '#E03A3E', SAC: '#5A2D81', SAS: '#C4CED4', TOR: '#CE1141',
  UTA: '#F9A01B', WAS: '#E31837',
};

export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new Response('Server config error', { status: 500 });
  }

  const sb = createClient(url, key);
  const { data } = await sb
    .from('shared_graphs')
    .select('title, subtitle, teams, league')
    .eq('id', id)
    .single();

  if (!data) {
    return new Response('Not found', { status: 404 });
  }

  const { title, subtitle, teams, league } = data;

  // Pick up to 2 team colors for accent bars
  const teamColors = (teams as string[])
    .map((t: string) => TEAM_COLORS[t])
    .filter(Boolean)
    .slice(0, 2);

  const leftColor = teamColors[0] || '#ff6b35';
  const rightColor = teamColors[1] || teamColors[0] || '#4ecdc4';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0a0a0f',
          padding: 0,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Top accent bar */}
        <div style={{ display: 'flex', height: 6 }}>
          <div style={{ flex: 1, backgroundColor: leftColor }} />
          <div style={{ flex: 1, backgroundColor: rightColor }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 48px 0',
        }}>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
            color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase' as const,
          }}>
            {league === 'WNBA' ? 'WNBA' : 'NBA'} TRADE MAPPER
          </div>
        </div>

        {/* Main content */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          padding: '0 48px',
          gap: 16,
        }}>
          {/* Title */}
          <div style={{
            fontSize: 52,
            fontWeight: 800,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: 1000,
          }}>
            {title}
          </div>

          {/* Subtitle */}
          {subtitle && (
            <div style={{
              fontSize: 22,
              color: 'rgba(255,255,255,0.5)',
              textAlign: 'center',
              maxWidth: 800,
            }}>
              {subtitle}
            </div>
          )}

          {/* Team badges */}
          {teams && (teams as string[]).length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {(teams as string[]).slice(0, 4).map((teamId: string) => (
                <div
                  key={teamId}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 6,
                    backgroundColor: TEAM_COLORS[teamId] || '#333',
                    color: '#ffffff',
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                >
                  {teamId}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '0 48px 24px',
        }}>
          <div style={{
            fontSize: 14,
            color: 'rgba(255,255,255,0.25)',
          }}>
            nbatrades.vercel.app
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  );
}
