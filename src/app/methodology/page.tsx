import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How We Score Trades | NBA Trade Mapper',
  description:
    'Our methodology for evaluating NBA trades: Win Shares, playoff premium, contribution-weighted championships, and accolade bonuses.',
};

export default function MethodologyPage() {
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
        {/* Title */}
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
          HOW WE SCORE TRADES
        </h1>

        <Divider />

        {/* The Question */}
        <Section title="THE QUESTION">
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>
              Who got the better end of the deal?
            </strong>
          </p>
          <p>
            Not predictions, not draft-night grades, not what the trade
            &ldquo;should have been.&rdquo; We measure what each team got.
          </p>
        </Section>

        <Divider />

        {/* The Formula */}
        <Section title="THE FORMULA">
          <p>
            Every player is scored on what they produced{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              on the acquiring team, after the trade.
            </strong>{' '}
            Pre-trade stats don&rsquo;t count. Stats on other teams don&rsquo;t
            count.
          </p>

          <FormulaBlock />

          <p>
            The team with the higher total won &mdash;{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              but only if the margin exceeds 1.5 points.
            </strong>{' '}
            A 0.8-point edge could flip on one decent season.
          </p>
        </Section>

        <Divider />

        {/* Win Shares */}
        <Section title="WIN SHARES">
          <p>
            Dean Oliver&rsquo;s stat. Divides team wins among players based on
            their contributions. One Win Share &asymp; one win. Available back
            to 1977.
          </p>
          <p>
            Team-dependent: a player on a 60-win team has more wins to divide
            than the same player on a 30-win team. If a player gets traded to a
            bad team and the team keeps losing, the trade didn&rsquo;t produce
            wins.
          </p>
        </Section>

        <Divider />

        {/* Playoff WS */}
        <Section title="PLAYOFF WIN SHARES &times; 1.5">
          <p>
            Same math, playoff games, 1.5&times; weight. Teams that go deeper
            play more games and accumulate more. A trade that reaches the Finals
            produced more than a first-round exit.
          </p>
        </Section>

        <Divider />

        {/* Championship Bonus */}
        <Section title="CHAMPIONSHIP BONUS">
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--accent-gold)',
              margin: '0 0 16px',
            }}
          >
            Championship Bonus = 5.0 &times; (Player&rsquo;s Playoff WS &divide;
            Team&rsquo;s Total Playoff WS)
          </div>
          <p>
            Carry 35% of the postseason workload, get +1.75 per title. Ride the
            bench, get a fraction.
          </p>
        </Section>

        <Divider />

        {/* Accolade Bonus */}
        <Section title="ACCOLADE BONUS">
          <p>
            Awards catch what the box score misses.
          </p>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              margin: '16px 0',
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                {['Award', 'Bonus', 'Rationale'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border-medium)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accolades.map(([award, bonus, rationale]) => (
                <tr key={award}>
                  <td
                    style={{
                      padding: '8px 12px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      borderBottom: '1px solid var(--border-subtle)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {award}
                  </td>
                  <td
                    style={{
                      padding: '8px 12px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-gold)',
                      borderBottom: '1px solid var(--border-subtle)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {bonus}
                  </td>
                  <td
                    style={{
                      padding: '8px 12px',
                      color: 'var(--text-secondary)',
                      borderBottom: '1px solid var(--border-subtle)',
                      lineHeight: 1.5,
                    }}
                  >
                    {rationale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p>
            Awards double-count great seasons. They should. A player who leads
            the league in Win Shares by a wide margin gets the same WS credit as
            one who barely leads. The award captures the gap.
          </p>
        </Section>

        <Divider />

        {/* What we don't capture */}
        <Section title="WHAT THIS SYSTEM DOESN&rsquo;T CAPTURE">
          {limitations.map(([title, desc]) => (
            <div key={title} style={{ marginTop: 12 }}>
              <strong style={{ color: 'var(--text-primary)' }}>
                {title}.
              </strong>{' '}
              {desc}
            </div>
          ))}
        </Section>

        <Divider />

        {/* Why Win Shares */}
        <Section title="WHY WIN SHARES">
          <ul style={{ margin: '0', paddingLeft: 20, lineHeight: 2 }}>
            {alternatives.map(([name, reason]) => (
              <li key={name}>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {name}:
                </strong>{' '}
                {reason}
              </li>
            ))}
          </ul>
        </Section>

        <Divider />

        {/* Data Sources */}
        <Section title="DATA SOURCES">
          <p>
            All from{' '}
            <a
              href="https://www.basketball-reference.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--accent-blue)',
                textDecoration: 'none',
                borderBottom: '1px solid var(--accent-blue)',
              }}
            >
              Basketball Reference
            </a>
            . Stats count only after the trade, on the acquiring team.
          </p>
          <ul style={{ margin: '12px 0', paddingLeft: 20, lineHeight: 2 }}>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Regular season:
              </strong>{' '}
              23,500+ player-seasons (1977&ndash;present)
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Playoffs:
              </strong>{' '}
              9,100+ player-seasons
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Championships:
              </strong>{' '}
              49 verified champions
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Accolades:
              </strong>{' '}
              2,500+ awards
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Trades:
              </strong>{' '}
              1,935 (1976&ndash;present)
            </li>
          </ul>
        </Section>

        <Divider />

        {/* Edge Cases */}
        <Section title="EDGE CASES">
          {edgeCases.map(([title, desc]) => (
            <div key={title} style={{ marginBottom: 12 }}>
              <strong style={{ color: 'var(--text-primary)' }}>
                {title}
              </strong>{' '}
              {desc}
            </div>
          ))}
        </Section>
      </article>
    </div>
  );
}

/* ── Helper components ──────────────────────────────────────────────── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 8 }}>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          letterSpacing: 1.5,
          color: 'var(--text-primary)',
          marginBottom: 16,
        }}
        dangerouslySetInnerHTML={{ __html: title }}
      />
      {children}
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

function FormulaBlock() {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '20px 24px',
        margin: '20px 0',
        fontFamily: 'var(--font-mono)',
        fontSize: 14,
        lineHeight: 2,
        color: 'var(--text-primary)',
      }}
    >
      <span style={{ color: 'var(--accent-blue)' }}>Player Score</span> ={' '}
      Win Shares
      <br />
      <span style={{ color: 'var(--text-muted)', paddingLeft: 100 }}>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+
      </span>{' '}
      (Playoff Win Shares{' '}
      <span style={{ color: 'var(--accent-orange)' }}>&times; 1.5</span>)
      <br />
      <span style={{ color: 'var(--text-muted)' }}>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+
      </span>{' '}
      Championship Bonus{' '}
      <span style={{ color: 'var(--accent-gold)' }}>(contribution-weighted)</span>
      <br />
      <span style={{ color: 'var(--text-muted)' }}>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+
      </span>{' '}
      Accolade Bonus
    </div>
  );
}

/* ── Data ───────────────────────────────────────────────────────────── */

const accolades: [string, string, string][] = [
  ['MVP', '+5.0', 'Captures dominance that cumulative stats understate.'],
  ['Finals MVP', '+3.0', 'Best player on the biggest stage.'],
  ['DPOY', '+2.5', 'Primary correction for defensive value.'],
  ['All-NBA 1st Team', '+2.0', 'Top 5 player that season.'],
  ['ROY', '+1.5', 'Immediate contributor \u2014 relevant for picks.'],
  ['All-NBA 2nd Team', '+1.2', 'Top 10 player.'],
  ['Sixth Man', '+0.8', 'Best reserve.'],
  ['All-NBA 3rd Team', '+0.7', 'Top 15 player.'],
  ['MIP', '+0.5', 'Breakout season.'],
  ['All-Defensive Team', '+0.5', 'Broader defensive correction than DPOY alone.'],
  ['All-Star', '+0.3', 'Partially a popularity contest.'],
  ['All-Rookie Team', '+0.2', 'Minor signal.'],
];

const limitations: [string, string][] = [
  [
    'Strategic value',
    'A team that trades a star for expirings to clear cap space scores zero for the expirings.',
  ],
  [
    'Peak impact',
    'Eight solid years outscores two brilliant years.',
  ],
  [
    'Defensive impact beyond awards',
    'Elite defenders who didn\u2019t win DPOY or make All-Defensive teams are undervalued.',
  ],
];

const edgeCases: [string, string][] = [
  [
    'Recent trades',
    'have fewer seasons to accumulate.',
  ],
  [
    'Sign-and-trades',
    'are flagged separately. The player already chose the destination.',
  ],
  [
    'Unresolved draft picks',
    'score zero until the player enters the league.',
  ],
  [
    'Three-team trades:',
    'each team scored independently. Facilitators score low by design.',
  ],
];

const alternatives: [string, string][] = [
  ['PER', 'Overvalues high-usage scorers. Outdated.'],
  ['VORP', 'Ignores team quality. We want team quality.'],
  ['BPM', 'Rate stat. We need cumulative production.'],
  ['EPM / RAPTOR / LEBRON / DARKO', 'Proprietary, defunct, or only from ~2014.'],
  ['Raw box score', 'Doesn\u2019t account for efficiency, defense, or winning.'],
];
