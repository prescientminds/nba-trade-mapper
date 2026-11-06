import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Our Team | NBA Trade Mapper',
  description:
    'The people behind NBA Trade Mapper.',
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

        <p style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 14 }}>
          Basketball fans, writers, analysts, podcasters, and one former player.
        </p>

        <p
          style={{
            marginBottom: 40,
            color: 'var(--text-tertiary)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            fontStyle: 'italic',
          }}
        >
          *Largely fictional.
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
    bio: `6\u20198\u2033 power forward out of Southeastern Louisiana. Undrafted, 2002. Spent two seasons as the 14th man in Atlanta \u2014 the 2004-05 Hawks went 13-69. Career high of 8 points against Toronto, all in the fourth quarter, after Toronto\u2019s starters were already in street clothes. Hawks lost by 31.\n\nHis last minimum contract was salary ballast in a deadline deal. His name appeared between two semicolons on the ESPN transaction wire. He never reported, and was waived four days later.`,
  },
  {
    name: 'VINCE TORRETTI',
    title: 'Director of Player Evaluation',
    image: '/images/team/vince-toretti.png',
    bio: `Nine years as an advance scout for a mid-market front office. In November 2014 he graded a 23-year-old wing 16 out of 20. Six weeks later the GM traded the wing for a veteran on an expiring deal. The veteran left that summer. The wing made an All-Star team three years later. Torretti was let go the following April.\n\nIn 2024 he looked up the trade on NBA Trade Mapper. It had an F. He applied the same afternoon.`,
  },
  {
    name: 'EZRA KATZ',
    title: 'Senior Writer',
    image: '/images/team/ezra-katz.png',
    bio: `A signed Kevin Durant rookie card sits on his desk in a UV-protective case. His father ran community relations for the Seattle SuperSonics.\n\nIn 2007 the Sonics hired Sam Presti, who drafted Durant, then Westbrook, then Harden \u2014 three future MVPs in three straight drafts, for a franchise that was already leaving. The team moved to Oklahoma City in 2008. His father\u2019s position was eliminated.\n\nHe covers front office strategy. He has an MFA from the Iowa Writers\u2019 Workshop; his thesis was short stories about competitive swimmers. Katz does not discuss Oklahoma City.`,
  },
  {
    name: 'MARA KINGSLEY',
    title: 'NBA Analyst',
    image: '/images/team/mara-kingsley.png',
    bio: `Covered the Pacers for the Indianapolis Star-Tribune, then Hardcourt, an independent publication that built a readership, went behind a paywall, and lost it. She was the last writer they let go.\n\nHer Monday column, \u201cThe Revisit,\u201d re-graded one trade from the previous decade. It ran 127 Mondays. Rereading her own column on a Pacers deal, she found her conclusion had held up and her reasoning hadn\u2019t. That happened often.\n\nWhen two teams make a trade, she says, they are trading time.`,
  },
  {
    name: 'DION CARLISLE',
    title: 'Host, The Swap',
    image: '/images/team/dion-carlisle.png',
    bio: `Quit selling medical devices in Charlotte to start The Swap in 2019, because nobody followed up. Every trade gets revisited at six months, one year, and three years. The three-year episode is \u201cThe Verdict.\u201d The show averages 340 listeners.\n\nHis episode on a Clippers-Thunder salary dump got eleven downloads and a citation in a front office\u2019s internal memo. It is pinned at the top of the feed. He records from a converted closet in the East Rutherford office that the team calls \u201cthe booth\u201d and he calls the booth.`,
  },
  {
    name: 'TERRENCE \u201cT-BONE\u201d MASSEY',
    title: 'Senior Trade Analyst & On-Air Commentator',
    image: '/images/team/terrence-massey.png',
    bio: `Hosted The Fourth Quarter on WNJR 1430 AM out of Newark from 2011 to 2019, on a signal that reached most of the Ironbound and, depending on weather, parts of Elizabeth. He predicted LeBron would go west. LeBron went to the Lakers. The Lakers missed the playoffs. Massey counted it as correct.\n\nWhen Trade Mapper graded the Butler-to-Minnesota trade a C+, he emailed a rebuttal with \u201calgorithm\u201d misspelled in the subject line. Buried on page two was a gap in the scoring engine nobody on staff had flagged.\n\nHe files the Saturday column from a Dunkin\u2019 on Ferry Street because his apartment Wi-Fi cuts out. His Google Doc \u201cOptimum Outage Log\u201d holds fourteen timestamps and one annotation: \u201cthey know.\u201d`,
  },
  {
    name: 'RACHEL XU',
    title: 'Lead Quantitative Analyst',
    image: '/images/team/rachel-xu.png',
    bio: `PhD in applied mathematics from Columbia; her dissertation was on semiconductor supply chains. She found the Win Shares formula on Wikipedia during an argument with a labmate and built a scoring engine in a Jupyter notebook.\n\nShe refused, on principle, to assign trades letter grades. She was overruled. The letter grades get ten times the engagement.`,
  },
  {
    name: 'NATE GERSHON',
    title: 'Salary Cap Analyst',
    image: '/images/team/nate-gershon.png',
    bio: `Grew up in Memphis. Was at a player agency when the 2016 cap spike handed every team $24 million in unexpected space. Memphis gave Chandler Parsons $22 million a year; Parsons played 95 games over three seasons. Gershon read Article VII of the CBA and saw that the rules had produced that contract. He left the agency the following spring.\n\nAbove the Gershon Threshold, a contract almost never ranks as efficient, however good the player. He has a framed printout of Article VII, Section 6 on his wall. Nobody has asked him about it. He is waiting.`,
  },
  {
    name: 'TOM\u00c1S HERRERA',
    title: 'Content & Social Media Director',
    image: '/images/team/tomas-herrera.png',
    bio: `Tom\u00e1s Herrera has run social media for a sparkling water brand, a tequila rebrand, and an LA coworking company. He is passionate about all things NBA and feels blessed every day to be doing what he loves. His Instagram has been deactivated since 2021 \u2014 ironic, he knows.`,
  },
  {
    name: 'JAKE LAUFER',
    title: 'Staff Writer',
    image: '/images/team/jake-laufer.png',
    bio: `Jake Laufer grew up going to Pacers games with his father. The happiest he ever saw his dad was the Hibbert and Paul George years. Then the league went small, and George was sent to Oklahoma City.\n\nHe traced the chain backward. In 1997 the Sonics traded Bobby Jackson for a second-round pick that became Rashard Lewis. Lewis became a trade exception, which became a 2008 first that became Serge Ibaka. Ibaka became Victor Oladipo and Domantas Sabonis, who became Paul George. George became Shai Gilgeous-Alexander.\n\nWhen he finds a new chain, his dad is still the first person he calls.`,
  },
  {
    name: 'JESSIE TRAN',
    title: 'Data Engineer',
    image: '/images/team/jessie-tran.png',
    bio: `She is supposed to be at Virginia Tech finishing a computer science degree. That was the plan two years ago, when she started as a summer intern.\n\nShe found the parseFloat bug: one line that dropped every player with zero Win Shares, Dajuan Wagner (6th pick, 2002) among them. This felt meaningful to her.`,
  },
  {
    name: 'TALIA SANTOS',
    title: 'On-Camera Correspondent & Creator',
    image: '/images/team/talia-santos.png',
    bio: `D1 swimmer at Miami. Chosen to host Quibi\u2019s revival of Wild On!; Quibi shut down before it aired. She covered BMX in Tokyo and basketball in Paris for NBC. Her Anthony Edwards interview in Le Marais got six million views.\n\nShe believes every trade is about ego. There are two kinds of men \u2014 those who name their first son after themselves, and those who don\u2019t.`,
  },
];
