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
  image,
}: {
  name: string;
  title: string;
  bio: string;
  stats?: string;
  image?: string;
}) {
  return (
    <section style={{ marginBottom: 8 }}>
      {image && (
        <div
          style={{
            marginBottom: 24,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <img
            src={image}
            alt={name}
            style={{
              width: '100%',
              display: 'block',
              objectFit: 'cover',
            }}
          />
        </div>
      )}
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
      {bio.split('\n\n').map((paragraph, i, arr) => (
        <p key={i} style={{ marginBottom: i < arr.length - 1 ? 16 : (stats ? 12 : 0) }}>
          {paragraph}
        </p>
      ))}
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
  image?: string;
}[] = [
  {
    name: 'DARIUS CLEMONS',
    title: 'Player Personnel Consultant',
    image: '/images/team/darius-clemons.png',
    bio: `6\u20198\u2033 power forward out of Southeastern Louisiana. Undrafted, 2002. Signed with Golden State on the last day of training camp after their third-string power forward tore his meniscus in a preseason game against Seattle. Appeared in 14 games, shot 29% from the field. Waived in January. Spent two seasons in Atlanta as the 14th man on one of the worst rosters in modern NBA history \u2014 the 2004-05 Hawks went 13-69. His best year was 2003-04: 2.7 points, 0.8 rebounds, 3.0 minutes per game across 28 appearances. Career high of 8 points against Toronto, all in the fourth quarter, after Toronto\u2019s starters were already in street clothes. Hawks lost by 31. Finished with 9 games in Charlotte before his expiring minimum contract was included as salary ballast in a multi-team deadline deal that routed a starting-caliber wing to the Lakers. His name appeared between two semicolons on the ESPN transaction wire. He was assigned to a Western Conference team, never reported, and was waived four days later.`,
    stats: '51 G \u00b7 41 PTS \u00b7 18 REB \u00b7 4.2 PER \u00b7 Career earnings: ~$1.6M (4 league-minimum contracts)',
  },
  {
    name: 'VINCE TORRETTI',
    title: 'Director of Player Evaluation',
    image: '/images/team/vince-toretti.png',
    bio: `Spent nine years as an advance scout for a mid-market front office \u2014 the kind of role where you fly to Oklahoma City on a Tuesday to watch a second-round pick play 14 minutes against the Thunder, write a report no one reads until February, and fly home the next morning. He graded players on a proprietary 20-point scale he\u2019d built over years of watching basketball in half-empty arenas. In November 2014, the front office moved a first-round pick and a 23-year-old wing for a veteran forward on an expiring deal. Torretti\u2019s report on the wing \u2014 filed six weeks earlier \u2014 had graded him a 16 out of 20. The GM traded him anyway. The veteran left in free agency that summer. The wing made an All-Star team three years later. Torretti was let go in a restructuring the following April. He found NBA Trade Mapper in 2024 while searching the trade that ended his career. The scoring engine had graded it an F. He applied for a position the same afternoon.`,
    stats: '9 years advance scouting \u00b7 312 scouting reports filed \u00b7 1 trade graded F',
  },
  {
    name: 'MARA KINGSLEY',
    title: 'NBA Analyst',
    image: '/images/team/mara-kingsley.png',
    bio: `Mara Kingsley covered the Pacers beat for the Indianapolis Star-Tribune \u2014 three years of a mid-market team that the national media noticed when it made the playoffs and ignored the rest of the time. She moved to Hardcourt, an independent basketball publication that built a readership, went behind a paywall, and lost it. She was the last full-time writer they kept on. She was also the last one they let go.\n\nHer column ran every Monday during the season. One trade from the previous decade, re-evaluated with everything that had happened since. She called it \u201cThe Revisit.\u201d It started because she went back to a column she\u2019d written about a Pacers deal and found that her conclusion had held up but her reasoning hadn\u2019t. She wanted to know how often that happened. It happened often.\n\nAt Trade Mapper, she does the forensic work \u2014 the piece that looks at a trade everyone graded and finds the asset nobody was watching. The third player in a five-piece deal. The conditional pick that conveyed. The expiring contract that didn\u2019t expire.`,
    stats: 'Pacers beat \u00b7 Hardcourt \u00b7 127 Mondays of \u201cThe Revisit\u201d',
  },
  {
    name: 'DION CARLISLE',
    title: 'Host, The Swap',
    image: '/images/team/dion-carlisle.png',
    bio: `Dion Carlisle started The Swap in 2019 because nobody followed up. Every podcast reacted to trades. His show did the opposite: every trade revisited at six months, one year, and three years. He calls the three-year episode \u201cThe Verdict.\u201d\n\nBefore the podcast, he sold medical devices in Charlotte, North Carolina. He quit to start a show about basketball trades for an audience he didn\u2019t have yet. The audience found him. It averages 340 per episode.\n\nHe once recorded an episode about a Clippers-Thunder salary dump that eleven people downloaded and a front office cited in an internal memo. It is the only episode pinned at the top of the feed. He records from a converted closet in the East Rutherford office that the team calls \u201cthe booth\u201d and he calls the booth.`,
    stats: '340 listeners \u00b7 6-month / 1-year / 3-year format \u00b7 1 front-office citation \u00b7 The booth',
  },
  {
    name: 'TERRENCE \u201cT-BONE\u201d MASSEY',
    title: 'Senior Trade Analyst & On-Air Commentator',
    image: '/images/team/terrence-massey.png',
    bio: `Terrence Massey hosted The Fourth Quarter on WNJR 1430 AM out of Newark from 2011 to 2019. Four nights a week, on a signal that reached most of the Ironbound and, depending on weather, parts of Elizabeth.\n\nHe once argued that the Clippers should trade Chris Paul because point guards who average more than 9 assists \u201cburn out the ball.\u201d Paul made the All-NBA Second Team that year. Massey graded the season a B-minus because \u201cthe Second Team proves my point.\u201d He predicted LeBron would leave Cleveland for the Western Conference because \u201cLeBron has never won a championship without home-court advantage in the Finals.\u201d LeBron went to the Lakers. The Lakers missed the playoffs. Massey counted it as correct because LeBron went west.\n\nHe grew up in the Ironbound \u2014 Portuguese and Brazilian Newark, east of Penn Station. His uncle Manny installed tile and watched Nets games with the volume off because he believed announcers \u201cput ideas in your head that aren\u2019t in the game.\u201d Manny had played one season of semi-professional basketball in the Azores in 1983 and came home with a theory that any team carrying more than two left-handed players was structurally compromised. The theory had no evidentiary basis. It had Manny\u2019s full conviction, which in the Massey household functioned as evidentiary basis. Before the radio station, Massey sold Hondas on Route 22 in Union. He left for the WNJR slot, which paid $340 a week.\n\nHe found Trade Mapper after someone texted him a share card of the Jimmy Butler trade from Chicago to Minnesota. The site had it at C+ for Minnesota. Massey had given it an A on air. He emailed a rebuttal with \u201calgorithm\u201d misspelled in the subject line. Most of it was wrong. Buried on page two was a sentence about how Win Shares, as a cumulative stat, penalizes players who change teams mid-season because they lose games to the transition \u2014 a gap in the scoring engine nobody on staff had flagged.\n\nHis columns run three days a week. He files the Saturday column from a Dunkin\u2019 Donuts on Ferry Street because his apartment Wi-Fi cuts out regularly. He has a Google Doc titled \u201cOptimum Outage Log\u201d \u2014 fourteen timestamps, no analysis, and a single annotation that reads \u201cthey know.\u201d`,
    stats: 'WNJR 1430 AM, 2011\u20132019 \u00b7 ~400 listeners (self-reported) \u00b7 1 correctly identified gap in the CATV formula \u00b7 14 documented Optimum outages (unanalyzed)',
  },
  {
    name: 'RACHEL XU',
    title: 'Lead Quantitative Analyst',
    image: '/images/team/rachel-xu.png',
    bio: `PhD in applied mathematics from Columbia. Dissertation: supply chain disruptions in semiconductor manufacturing. She found the Win Shares formula on Wikipedia during a basketball argument with a labmate and spent three months building a scoring engine in a Jupyter notebook nobody asked for. Before Trade Mapper, two years in a Western Conference front office analytics department, where she built predictive models for trade outcomes that the GM consulted once \u2014 before a deadline deal her model flagged as a D-minus. The GM made the deal. It graded as a D-minus. She left that summer.\n\nShe built the CATV formula, designed the scoring methodology, and wrote the statistical framework that powers every trade grade on the site. She is the only person on staff who has refused to assign a letter grade to a trade on principle. She was overruled. The letter grades get ten times the engagement.`,
    stats: 'PhD Applied Mathematics, Columbia \u00b7 2 years in a Western Conference front office \u00b7 Built the CATV formula \u00b7 Preferred continuous scoring (overruled)',
  },
  {
    name: 'NATE GERSHON',
    title: 'Salary Cap Analyst',
    image: '/images/team/nate-gershon.png',
    bio: `His job at a player agency in New York was to read the Collective Bargaining Agreement until he understood it and then explain it to agents who needed it explained. Three years of this. The agents wanted the answers \u2014 which exception applies, how much cap room, can we structure it this way \u2014 but not the reasoning, which was the part Gershon cared about. He left when he realized the job was about the dinners, not the document.\n\nHe can tell you the luxury tax threshold for any season back to 2011. He knows the apron, the mid-level and its variants, every traded player exception on every active roster and when it expires. These are not party tricks. He does not go to parties. They are the vocabulary of a language most of the basketball world speaks badly \u2014 the language of why trades are structurally possible, which is a different question from why they happen, and in his view the more interesting one.\n\nAt Trade Mapper, he\u2019s the one who notices when a column says \u201ccap flexibility\u201d without naming the exception, or when a trade breakdown gets the salary matching wrong by a fraction. He gets visibly energized when a front office uses a traded player exception correctly.\n\nHe has a framed printout of Article VII, Section 6 on his wall. Nobody has asked him about it. He is waiting.`,
    stats: '3 years at a player agency \u00b7 Luxury tax thresholds memorized back to 2011 \u00b7 1 framed CBA article (uncommented upon)',
  },
  {
    name: 'JESSIE TRAN',
    title: 'Data Engineer',
    image: '/images/team/jessie-tran.png',
    bio: `She maintains the data pipeline, the scraping scripts, the Supabase schema, and the daily update workflow. She is supposed to be at Virginia Tech finishing a computer science degree. That was the plan two years ago when she started as a summer intern writing import scripts. Her parents have asked about the degree three times. She has answered three times that she\u2019s taking a gap year.\n\nShe found the parseFloat bug \u2014 a single line storing every player with exactly zero Win Shares as null, no error, no log entry, 340 rows silently wrong. She once logged into the production database at 2 a.m. because Xu\u2019s query was returning a number that couldn\u2019t be right. The number was right. The trade was just that bad.`,
    stats: '2 years (ongoing) \u00b7 Found the parseFloat bug (340 rows) \u00b7 1 gap year (extended) \u00b7 3 parental inquiries (deflected)',
  },
];
