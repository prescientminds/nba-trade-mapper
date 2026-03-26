import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Our Team | NBA Trade Impact Mapper',
  description:
    'The people behind NBA Trade Impact Mapper.',
};

export default function TeamPage() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--bg-primary)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--bg-tertiary) transparent',
      }}
    >
      {/* Back link */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'rgba(10, 10, 15, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--accent-orange)',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Trade Mapper
        </Link>
      </nav>

      <article
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '48px 24px 120px',
          fontFamily: 'var(--font-body)',
          color: 'var(--text-secondary)',
          lineHeight: 1.75,
          fontSize: 15,
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 56,
            letterSpacing: 2,
            color: 'var(--text-primary)',
            lineHeight: 1.1,
            marginBottom: 12,
          }}
        >
          OUR TEAM
        </h1>

        <p style={{ marginBottom: 40, color: 'var(--text-muted)', fontSize: 14 }}>
          Basketball fans, writers, analysts, podcasters, and one former player.
        </p>

        <Divider />

        {team.map((member, i) => (
          <div key={member.name}>
            <TeamMember {...member} />
            {i < team.length - 1 && <Divider />}
          </div>
        ))}
      </article>
    </div>
  );
}

/* ── Components ───────────────────────────────────────────────────── */

function TeamMember({
  name,
  title,
  bio,
  stats,
}: {
  name: string;
  title: string;
  bio: string;
  stats?: string;
}) {
  return (
    <section style={{ marginBottom: 8 }}>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          letterSpacing: 1.5,
          color: 'var(--text-primary)',
          marginBottom: 4,
        }}
      >
        {name}
      </h2>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: 'var(--accent-orange)',
          marginBottom: 16,
        }}
      >
        {title}
      </div>
      <p style={{ marginBottom: stats ? 12 : 0 }}>{bio}</p>
      {stats && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-muted)',
            marginTop: 8,
            lineHeight: 1.8,
          }}
        >
          {stats}
        </div>
      )}
    </section>
  );
}

function Divider() {
  return (
    <hr
      style={{
        border: 'none',
        height: 1,
        background: 'var(--border-subtle)',
        margin: '32px 0',
      }}
    />
  );
}

/* ── Data ─────────────────────────────────────────────────────────── */

const team: {
  name: string;
  title: string;
  bio: string;
  stats?: string;
}[] = [
  {
    name: 'DARIUS CLEMONS',
    title: 'Player Personnel Consultant',
    bio: `6\u20198\u2033 power forward out of Southeastern Louisiana. Undrafted, 2002. Signed with Golden State on the last day of training camp after their third-string power forward tore his meniscus in a preseason game against Seattle. Appeared in 14 games, shot 29% from the field. Waived in January. Spent two seasons in Atlanta as the 14th man on one of the worst rosters in modern NBA history \u2014 the 2004-05 Hawks went 13-69. His best year was 2003-04: 2.7 points, 0.8 rebounds, 3.0 minutes per game across 28 appearances. Career high of 8 points against Toronto, all in the fourth quarter, after Toronto\u2019s starters were already in street clothes. Hawks lost by 31. Finished with 9 games in Charlotte before his expiring minimum contract was included as salary ballast in a multi-team deadline deal that routed a starting-caliber wing to the Lakers. His name appeared between two semicolons on the ESPN transaction wire. He was assigned to a Western Conference team, never reported, and was waived four days later.`,
    stats: '51 G \u00b7 41 PTS \u00b7 18 REB \u00b7 4.2 PER \u00b7 Career earnings: ~$1.6M (4 league-minimum contracts)',
  },
];
