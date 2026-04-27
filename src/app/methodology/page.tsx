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

        {/* Lede */}
        <p>
          A team&rsquo;s score counts only what its acquired players did in
          its uniform. Whatever those players did before the trade, or for
          any team that came after, belongs to someone else&rsquo;s ledger.
        </p>

        <Divider />

        {/* The Formula */}
        <Section title="THE FORMULA">
          <p>For each player a team received:</p>

          <FormulaBlock />

          <p>
            Sum the players. Compare the sums. The larger one wins &mdash;
            but only past a 1.5-point margin. Inside that margin we call it
            even, because a single rotation season can swing it.
          </p>
        </Section>

        <Divider />

        {/* Win Shares */}
        <Section title="WIN SHARES">
          <p>
            Dean Oliver&rsquo;s stat. It divides team wins among the players
            who produced them. One Win Share is roughly one win. The data
            goes back to 1977.
          </p>
          <p>
            The number is team-dependent on purpose: a 25-point scorer on a
            22-win team has fewer wins to claim than the same player on a
            55-win team.
          </p>
          <p>
            We track Box Plus/Minus but don&rsquo;t use it in the grade. It
            is the metric for shorter windows &mdash; early-career players,
            partial seasons, anywhere playoff Win Shares haven&rsquo;t
            accumulated yet.
          </p>
        </Section>

        <Divider />

        {/* Playoff WS */}
        <Section title="PLAYOFF WIN SHARES &times; 1.5">
          <p>
            The same calculation, applied to the postseason, weighted by half
            again. A trade that took its team to the conference finals
            produced more than one that ended on a Tuesday in April.
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
            A title is worth five points, distributed by playoff workload.
            Rings count for the whole roster, weighted by who did the work.
          </p>
        </Section>

        <Divider />

        {/* Accolade Bonus */}
        <Section title="ACCOLADE BONUS">
          <p>
            Awards catch what the box score misses. The defensive side of
            Win Shares is the weakest part of the metric, so DPOY and
            All-Defensive carry more weight than their place in the league
            hierarchy would suggest. MVP and Finals MVP carry the most,
            because they describe the player the trade actually delivered.
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
            Awards are subjective, but they capture a league consensus about
            a player&rsquo;s season.
          </p>
        </Section>

        <Divider />

        {/* Why Win Shares */}
        <Section title="WHY WIN SHARES">
          <p>We tested every public alternative.</p>
          <ul style={{ margin: '12px 0', paddingLeft: 20, lineHeight: 2 }}>
            {alternatives.map(([name, reason]) => (
              <li key={name}>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {name}:
                </strong>{' '}
                {reason}
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 16 }}>
            Win Shares is the only public metric that goes back to the merger
            and ties production to team outcomes. Both of those mattered.
          </p>
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
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Salary contracts:
              </strong>{' '}
              15,370 (1984&ndash;2031, 2,102 unique players)
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
  ['MVP', '+5.0', 'Carried the league. Captures dominance the box score understates.'],
  ['Finals MVP', '+3.0', 'Best player on the biggest stage. The most trade-relevant award we have.'],
  ['DPOY', '+2.5', 'Primary correction for the weakest part of WS.'],
  ['All-NBA 1st Team', '+2.0', 'Top five.'],
  ['ROY', '+1.5', 'Immediate impact. Relevant for graded picks.'],
  ['All-NBA 2nd Team', '+1.2', 'Top ten.'],
  ['Sixth Man', '+0.8', 'A role WS handles, but the award marks the player the league agreed on.'],
  ['All-NBA 3rd Team', '+0.7', 'Top fifteen.'],
  ['MIP', '+0.5', 'A breakout.'],
  ['All-Defensive Team', '+0.5', 'Defensive credit beyond DPOY.'],
  ['All-Star', '+0.3', 'Half popularity, half merit. Repeated selections matter more than the first.'],
  ['All-Rookie Team', '+0.2', 'Minor signal.'],
];

const edgeCases: [string, string][] = [
  [
    'Recent trades',
    'have fewer seasons banked. Their grades will move.',
  ],
  [
    'Sign-and-trades',
    'are flagged. The destination was the player’s choice.',
  ],
  [
    'Unresolved picks',
    'score zero until the player enters the league.',
  ],
  [
    'Three-team trades',
    'are scored independently per team. Facilitators usually grade poorly.',
  ],
];

const alternatives: [string, string][] = [
  ['PER', 'Overweights volume scoring. The field has moved past it.'],
  ['VORP', 'Correlates with WS at about 0.85, but does not factor in team success, essential to evaluating the success of a trade.'],
  ['BPM', 'Per-possession rate stat. Does not factor in team success.'],
  ['EPM, RAPTOR, LEBRON, DARKO', 'Proprietary, retired, or only available since 2014.'],
];
