import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How We Score Trades | NBA Trade Impact Mapper',
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
        <Section title="THE QUESTION WE&rsquo;RE ANSWERING">
          <p>
            Every trade debate comes down to one question:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              who got the better end of the deal?
            </strong>
          </p>
          <p>
            We answer it with outcomes. Not predictions, not draft-night grades,
            not what the trade &ldquo;should have been.&rdquo; We measure what
            actually happened &mdash; the basketball production each team
            received from the assets they acquired &mdash; and let the numbers
            tell us who won.
          </p>
          <p>
            This is intentionally retrospective. We&rsquo;re not grading GMs on
            decision-making. We&rsquo;re measuring results.
          </p>
        </Section>

        <Divider />

        {/* The Formula */}
        <Section title="THE FORMULA">
          <p>
            Every player acquired in a trade is scored based on what they
            produced{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              on the team that acquired them, after the trade happened.
            </strong>{' '}
            Pre-trade stats don&rsquo;t count. Stats on other teams don&rsquo;t
            count. Only production in the jersey they were traded into.
          </p>

          <FormulaBlock />

          <p>
            Each team&rsquo;s total is the sum of all their acquired
            assets&rsquo; scores. The team with the higher total won the trade.
          </p>
          <p>
            Here&rsquo;s what each component measures and why it&rsquo;s in the
            formula.
          </p>
        </Section>

        <Divider />

        {/* Win Shares */}
        <Section title="WIN SHARES &mdash; THE FOUNDATION">
          <Label>What it is</Label>
          <p>
            A cumulative stat developed by basketball statistician Dean Oliver
            that divides team wins among individual players based on their
            offensive and defensive contributions. One Win Share &asymp; one win
            contributed.
          </p>

          <Label>Why we use it</Label>
          <p>
            Win Shares is the most comprehensive publicly available individual
            production stat with historical depth back to 1977. It synthesizes
            scoring efficiency, rebounding, assists, defense, and playing time
            into a single number that answers:{' '}
            <em>how much did this player contribute to winning?</em>
          </p>

          <Label>Why it&rsquo;s the baseline (1.0&times; weight)</Label>
          <p>
            Everything else in the formula builds on top of Win Shares.
            It&rsquo;s our unit of measurement &mdash; roughly one win added.
          </p>

          <Label>A note on team dependency</Label>
          <p>
            Win Shares divides up <em>team wins</em> among players, so a player
            on a 60-win team has more wins to divide up than the same player on a
            30-win team. Some systems try to correct for this by blending in
            player-centric stats like VORP (Value Over Replacement Player). We
            don&rsquo;t. If a player gets traded to a bad team and the team keeps
            losing, the trade didn&rsquo;t produce wins. That&rsquo;s the
            outcome, and we measure outcomes. Win Shares&rsquo; team-dependency
            isn&rsquo;t a flaw &mdash; it&rsquo;s the feature. It asks the same
            question we do:{' '}
            <em>did this trade help the team win?</em>
          </p>
        </Section>

        <Divider />

        {/* Playoff WS */}
        <Section title="PLAYOFF WIN SHARES &times; 1.5 &mdash; THE POSTSEASON PREMIUM">
          <Label>What it is</Label>
          <p>
            The same Win Shares methodology applied to playoff games only.
          </p>

          <Label>Why the 1.5&times; multiplier</Label>
          <p>
            Playoff basketball is a different sport. The competition is harder,
            the preparation is more intense, the stakes are existential. A Win
            Share earned in a Game 7 against the conference&rsquo;s best team is
            not equivalent to a Win Share earned in a Tuesday night
            regular-season game in January.
          </p>
          <p>
            We weight playoff production at 1.5&times; regular-season
            production &mdash; a playoff win contributed is worth 50% more than a
            regular-season win contributed. Most basketball analysts, players,
            and fans would argue it should be even higher. We chose 1.5&times; as
            a moderate premium that rewards postseason excellence without
            overwhelming the regular-season foundation.
          </p>

          <Label>The opportunity objection</Label>
          <p>
            Players on teams that go deeper in the playoffs have more games to
            accumulate Playoff Win Shares. A Finals participant might play 28
            playoff games; a first-round exit gets 4&ndash;7. Doesn&rsquo;t this
            bias the system toward deep-run teams?
          </p>
          <p>
            Yes &mdash; and intentionally. A trade that helps a team reach the
            Finals produces more postseason value than a trade that results in a
            first-round exit. The deeper run <em>is</em> the value. We&rsquo;re
            measuring what happened, and what happened is that the team played
            more high-stakes games and the player contributed to them.
          </p>
        </Section>

        <Divider />

        {/* Championship Bonus */}
        <Section title="CHAMPIONSHIP BONUS &mdash; CONTRIBUTION-WEIGHTED">
          <Label>What it is</Label>
          <p>
            A bonus applied to players who were on a championship-winning roster,
            scaled by their individual contribution to the playoff run.
          </p>

          <Label>How it works</Label>
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--accent-gold)',
              margin: '12px 0 16px',
            }}
          >
            Championship Bonus = 5.0 &times; (Player&rsquo;s Playoff WS &divide;
            Team&rsquo;s Total Playoff WS)
          </div>
          <p>
            A player who carried 35% of the team&rsquo;s postseason workload
            gets +1.75 per championship. The 12th man who played 30 total
            playoff minutes gets a fraction of a point. Finals MVPs typically
            receive the largest share.
          </p>

          <Label>Why contribution-weighted</Label>
          <p>
            A flat championship bonus would give the same credit to a Finals MVP
            and a bench player who never left the bench. That fails the eye test.
            A championship matters, but <em>how much you contributed to that
            championship</em> matters more. Scaling by playoff win share
            percentage ensures the bonus reflects individual impact, not roster
            proximity to a ring.
          </p>

          <Label>Why the 5.0 base</Label>
          <p>
            A championship is the goal of every NBA season. For the player who
            was the driving force &mdash; typically receiving 25&ndash;40% of the
            team&rsquo;s playoff win shares &mdash; this produces a bonus of
            roughly 1.25 to 2.0 points per title. For a key starter contributing
            15&ndash;20% of playoff production, it&rsquo;s about 0.75 to 1.0.
            These magnitudes feel right: significant but not dominant, a
            meaningful reward that doesn&rsquo;t override years of production
            data.
          </p>
        </Section>

        <Divider />

        {/* Accolade Bonus */}
        <Section title="ACCOLADE BONUS &mdash; WHAT STATS CAN&rsquo;T CAPTURE">
          <p>
            Individual awards catch things the box score misses: voter judgment,
            defensive excellence, peer recognition, breakout performance.
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

          <Label>The double-counting objection</Label>
          <p>
            &ldquo;If a player wins MVP, their great season is already captured
            in Win Shares. Aren&rsquo;t you counting it twice?&rdquo;
          </p>
          <p>
            Partially, yes. But awards capture <em>relative dominance</em> that
            cumulative stats flatten. A player who leads the league in Win Shares
            by a wide margin gets the same WS credit as a player who barely
            leads. The MVP award captures the gap &mdash; the degree to which one
            player was above the field. The bonus is the premium for being not
            just productive but <em>the most productive.</em>
          </p>
        </Section>

        <Divider />

        {/* Winner Determination */}
        <Section title="THE WINNER DETERMINATION">
          <p>
            After scoring all assets on each side, the team with the higher
            total is declared the winner &mdash;{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              but only if the margin exceeds 1.5 points.
            </strong>{' '}
            Below that threshold, the trade is considered effectively even.
          </p>
          <p>
            Why 1.5? At smaller margins, the result is within the noise of the
            measurement. A 0.8-point edge could flip based on one moderately
            productive season. The threshold prevents declaring winners in trades
            that were genuinely balanced.
          </p>
        </Section>

        <Divider />

        {/* What we measure */}
        <Section title="WHAT WE&rsquo;RE MEASURING (AND WHAT WE&rsquo;RE NOT)">
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>We measure:</strong>{' '}
            Total basketball production received by each team from the assets
            acquired in a trade, with premiums on playoff performance,
            championships, and individual distinction.
          </p>

          <p style={{ marginTop: 16 }}>
            <strong style={{ color: 'var(--text-primary)' }}>
              We do not measure:
            </strong>
          </p>

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

        {/* Data Sources */}
        <Section title="DATA SOURCES AND COVERAGE">
          <p>
            All statistics are sourced from{' '}
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
            </a>{' '}
            via the Kaggle BBRef dataset, covering:
          </p>
          <ul style={{ margin: '12px 0', paddingLeft: 20, lineHeight: 2 }}>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Regular-season stats:
              </strong>{' '}
              23,500+ player-season records (1977&ndash;present)
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Playoff stats:
              </strong>{' '}
              9,100+ player-season records with Playoff Win Shares
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Championships:
              </strong>{' '}
              49 verified champions with full roster data
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Accolades:
              </strong>{' '}
              2,500+ individual awards and honors
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>
                Trade data:
              </strong>{' '}
              1,935 trades from 1976 to present
            </li>
          </ul>
          <p>
            Stats are only counted for seasons <strong style={{ color: 'var(--text-primary)' }}>after the trade</strong> and{' '}
            <strong style={{ color: 'var(--text-primary)' }}>on the acquiring team.</strong>{' '}
            A player traded mid-season has only their post-trade production
            counted.
          </p>
        </Section>

        <Divider />

        {/* Edge Cases */}
        <Section title="SENSITIVITY AND EDGE CASES">
          {edgeCases.map(([title, desc]) => (
            <div key={title} style={{ marginBottom: 12 }}>
              <strong style={{ color: 'var(--text-primary)' }}>
                {title}
              </strong>{' '}
              {desc}
            </div>
          ))}
        </Section>

        <Divider />

        {/* Why Win Shares */}
        <Section title="WHY WIN SHARES?">
          <p>We considered and rejected several alternatives:</p>
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
          <p>
            Win Shares isn&rsquo;t perfect. But for a system that needs to
            evaluate trades across five decades with publicly available data,
            it&rsquo;s the best foundation available. Its team-dependency is a
            feature for our purposes, and accolade bonuses patch its known blind
            spots (defensive impact, relative dominance).
          </p>
        </Section>

        <Divider />

        {/* Bottom Line */}
        <Section title="THE BOTTOM LINE">
          <p>
            No single number can capture the full complexity of an NBA trade.
            Context, timing, salary, team-building phase, and strategic intent
            all matter &mdash; and none of them live in a box score.
          </p>
          <p>
            What we can do is measure the basketball that was actually played.
            Who produced more wins? Who performed when it mattered most? Who
            earned the highest individual honors? Our system adds up those
            contributions, weights them by context, and tells you which team came
            out ahead.
          </p>
          <p style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
            It&rsquo;s not the whole story. But it&rsquo;s the most important
            part of it.
          </p>
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        color: 'var(--accent-orange)',
        marginTop: 20,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
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
  [
    'MVP',
    '+5.0',
    'The highest individual honor. Even with Win Shares already counting the production, the MVP captures a level of dominance that cumulative stats alone understate.',
  ],
  [
    'Finals MVP',
    '+3.0',
    'The most trade-relevant accolade in basketball. It means this player was the most valuable player on the sport\u2019s biggest stage.',
  ],
  [
    'DPOY',
    '+2.5',
    'Our system\u2019s primary correction for defensive value. Win Shares\u2019 defensive component is unreliable. DPOY is the strongest signal for elite defense that our base stats miss.',
  ],
  [
    'All-NBA 1st Team',
    '+2.0',
    'Top 5 player in the league that season.',
  ],
  [
    'ROY',
    '+1.5',
    'Signals a player who contributed immediately \u2014 relevant for evaluating trades involving draft picks.',
  ],
  ['All-NBA 2nd Team', '+1.2', 'Top 10 player.'],
  [
    'Sixth Man',
    '+0.8',
    'Best reserve \u2014 a role Win Shares handles reasonably well, but the award signals organizational depth.',
  ],
  ['All-NBA 3rd Team', '+0.7', 'Top 15 player.'],
  ['MIP', '+0.5', 'Breakout season.'],
  [
    'All-Defensive Team',
    '+0.5',
    'Partial correction for the defensive blind spot \u2014 applied more broadly than DPOY.',
  ],
  [
    'All-Star',
    '+0.3',
    'Partially a popularity contest, but repeated selections signal sustained relevance. Low weight reflects the noise.',
  ],
  ['All-Rookie Team', '+0.2', 'Minor signal for immediate contribution.'],
];

const limitations: [string, string][] = [
  [
    'Decision quality',
    'A GM who makes a smart bet that doesn\u2019t pay off gets no credit. A GM who makes a dumb trade that works out does. We\u2019re measuring outcomes, not process.',
  ],
  [
    'Strategic value',
    'Cap space, roster flexibility, timeline alignment, and tank positioning are real forms of value that don\u2019t appear in our scoring. A team that trades a star for expiring contracts to clear cap space for a free agent signing scores zero for the expiring contracts \u2014 even if the cap space was the entire point.',
  ],
  [
    'Peak impact',
    'Our system is cumulative. Eight solid years outscores two transcendent years. This is accurate for total value received but doesn\u2019t capture the experience of watching a franchise-altering star for two seasons.',
  ],
  [
    'Marginal value',
    'We measure what a player produced, not what they produced relative to who they replaced. A player contributing 8 Win Shares per year scores identically whether he replaced a 6 WS player or a 0 WS player.',
  ],
  [
    'Defensive impact beyond awards',
    'Win Shares\u2019 defensive component is unreliable. Our system undervalues elite defenders who didn\u2019t win DPOY or make All-Defensive teams. We acknowledge this gap and use awards as a partial correction.',
  ],
];

const edgeCases: [string, string][] = [
  [
    'Recent trades are structurally disadvantaged.',
    'A trade from 2003 has 20+ years of statistical accumulation. A trade from 2024 has 1\u20132 seasons. Recent trades will climb the rankings as more seasons are played.',
  ],
  [
    'Sign-and-trade dynamics are different.',
    'In a sign-and-trade, the player has already chosen their destination \u2014 the sending team is getting something for a player who was leaving regardless. These trades are flagged separately in our system.',
  ],
  [
    'Draft picks are scored on outcomes.',
    'An unresolved future pick contributes zero until the pick is made and the player enters the league. This is accurate but means trades involving future picks can\u2019t be fully evaluated until those picks play out.',
  ],
  [
    'Three-team trades:',
    'Each team\u2019s haul is scored independently. The team with the most production received is the winner, but in three-team trades, one team is often a facilitator taking salary for picks \u2014 their low score reflects their role, not a bad trade.',
  ],
];

const alternatives: [string, string][] = [
  [
    'PER (Player Efficiency Rating)',
    'Overvalues high-usage scorers and is widely considered outdated by the analytics community.',
  ],
  [
    'VORP (Value Over Replacement Player)',
    'Measures individual production regardless of team quality. But we want team quality in the equation \u2014 if a trade didn\u2019t help the team win, Win Shares should reflect that. VORP also correlates ~0.85 with Win Shares, so it adds complexity without much new information.',
  ],
  [
    'BPM (Box Plus/Minus)',
    'Strong rate stat, but for trade evaluation we need cumulative production, not per-possession rates. A player who contributes at a high rate for 20 games produced less trade value than one who contributes at a moderate rate for 82.',
  ],
  [
    'EPM, RAPTOR, LEBRON, DARKO',
    'Modern tracking-based metrics that are either proprietary, defunct, or only available from ~2014 forward. None have the 50-year historical depth our system requires.',
  ],
  [
    'Raw box-score stats (PPG/RPG/APG)',
    'Don\u2019t account for efficiency, defense, or contribution to winning.',
  ],
];
