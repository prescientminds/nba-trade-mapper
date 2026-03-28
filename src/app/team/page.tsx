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
    bio: `Spent nine years as an advance scout for a mid-market front office \u2014 the kind of role where you fly to Oklahoma City on a Tuesday to watch a second-round pick play 14 minutes against the Thunder, write a report no one reads until February, and fly home the next morning. He graded players on a proprietary 20-point scale he\u2019d developed over years of watching basketball in half-empty arenas, and his evaluations were right more often than they were wrong, which in scouting is the only r\u00e9sum\u00e9 that matters. In November 2014, the front office moved a first-round pick and a 23-year-old wing for a veteran forward on an expiring deal. Torretti\u2019s report on the wing \u2014 filed six weeks earlier \u2014 had graded him a 16 out of 20. The GM traded him anyway. The veteran left in free agency that summer. The wing made an All-Star team three years later. Torretti was let go in a restructuring the following April. He found NBA Trade Mapper in 2024, while searching the trade that ended his career. The scoring engine had graded it an F. He applied for a position the same afternoon.`,
    stats: '9 years advance scouting \u00b7 312 scouting reports filed \u00b7 1 trade graded F',
  },
  {
    name: 'EZRA KATZ',
    title: 'Senior Writer',
    bio: `Covered the NBA for twelve seasons \u2014 four labor disputes and one bubble. Before that, an MFA from the Iowa Writers\u2019 Workshop, where his thesis was a collection of short stories about competitive swimmers that no NBA front office read before hiring him. He grew up in Bellevue, Washington, watching the Seattle SuperSonics at KeyArena with the same father who ran community relations for the franchise, which is how a twelve-year-old Ezra won an autographed Kevin Durant rookie card at Congregation Beth Shalom\u2019s annual trivia bowl in the spring of 2007 \u2014 the last season the Sonics played in Seattle. The card sits in a UV-protective case on his desk. He does not discuss Oklahoma City. His beat was the league at large \u2014 not a team but the structural forces, the recurring patterns, the thirty franchises making the same mistakes across thirty years. He wrote about the NBA the way a classicist writes about the Trojan War. When he found NBA Trade Mapper, he stopped writing columns and started writing from the data. He coined Dynasty Ingredients, Verdict Flips, and 52 terms in the Katz Dictionary. He coins terms the way other writers use adjectives \u2014 not to be clever, but because the right name for something is the shortest possible argument about it.`,
    stats: '12 years covering the NBA \u00b7 Iowa Writers\u2019 Workshop MFA, 2009 \u00b7 52 dictionary entries \u00b7 1 autographed Kevin Durant rookie card (Congregation Beth Shalom Trivia Bowl, 2007)',
  },
  {
    name: 'MARA KINGSLEY',
    title: 'NBA Analyst',
    bio: `Covered the Pacers beat for the Indianapolis Star-Tribune for three years, which taught her more about losing basketball than any analytics course could. Moved to Hardcourt \u2014 an independent basketball publication that published long-form trade analysis for an audience that peaked at 40,000 subscribers and declined steadily after the paywall went up. She was the last full-time writer they let go, which she took as both a compliment and a severance check. Her column ran every Monday during the season: one trade from the previous decade, re-evaluated with current data. She called it \u201cThe Revisit.\u201d It never had the readership it deserved, which she\u2019ll tell you is because 3,000-word trade retrospectives don\u2019t perform on social media. She\u2019s right about this and about most things. At Trade Mapper, she does the analysis that sits between Katz\u2019s structural essays and Laufer\u2019s explainers \u2014 the 1,500-word piece that tells you exactly why a B+ trade was actually a failure and names the specific asset that dragged it down. She was the first person on staff to use the term \u201cPhantom Limb\u201d in a published piece. Katz has not forgiven her for beating him to it.`,
    stats: '3 years beat reporting \u00b7 4 years at Hardcourt \u00b7 127 installments of \u201cThe Revisit\u201d',
  },
  {
    name: 'DION CARLISLE',
    title: 'Host, The Swap',
    bio: `Started The Swap in 2019 because he thought trade coverage was lazy. Every podcast reacted to trades. Nobody followed up. The show\u2019s format is the follow-up: every trade gets revisited at six months, one year, and three years. He calls the three-year episode \u201cThe Verdict,\u201d which predates the site\u2019s Verdict Flips category by two years \u2014 a fact he mentions approximately once per recording session. The audience averages 340 listeners per episode, which Carlisle considers a serious number because the 340 are serious people. He once recorded a 53-minute emergency episode about a salary dump involving the Clippers and the Thunder that received 11 downloads in its first week and was later cited in a front-office internal memo he is not supposed to know about but does. Before the podcast, he sold medical devices in Charlotte, North Carolina, and watched basketball the way some people follow geopolitics \u2014 not casually, not professionally, but with the obsessive pattern-recognition of someone who believes the whole thing is being run incorrectly and could prove it if anyone would listen. Someone listened. He now records from a converted closet in the East Rutherford office that the team calls \u201cthe booth\u201d and he calls \u201cthe booth\u201d without quotation marks.`,
    stats: '340 average listeners \u00b7 6-month / 1-year / 3-year revisit format \u00b7 1 episode cited in a front-office memo \u00b7 0 medical devices sold since 2019',
  },
  {
    name: 'RACHEL XU',
    title: 'Lead Quantitative Analyst',
    bio: `PhD in applied mathematics from Columbia, where her dissertation modeled supply chain disruptions in semiconductor manufacturing. She found the Win Shares formula on Wikipedia during a basketball argument with a labmate and spent the next three months building a scoring engine in a Jupyter notebook that nobody asked for. Before Trade Mapper, she spent two years in a Western Conference front office\u2019s analytics department, where she built predictive models for trade outcomes that the GM consulted exactly once \u2014 before a deadline deal that the model flagged as a D-minus and the GM made anyway. It graded as a D-minus. She left that summer. She built the CATV formula, designed the scoring methodology, and wrote the statistical framework that powers every trade grade on the site. When Katz coins a term like \u201cThe Null Set\u201d and claims 30% of trades accomplish nothing, the number came from her query. When Torretti says a player \u201cpassed the eye test,\u201d she asks him to define his threshold and he changes the subject. She is the only person on staff who has refused to assign a letter grade to a trade on principle, because she believes the continuous score is more honest than the discretized version. She was overruled. The letter grades get ten times the engagement.`,
    stats: 'PhD Applied Mathematics, Columbia \u00b7 2 years in a Western Conference front office \u00b7 Built the CATV formula \u00b7 Preferred continuous scoring (overruled)',
  },
  {
    name: 'TOM\u00c1S HERRERA',
    title: 'Content & Social Media Director',
    bio: `Spent three years at a brand agency in Los Angeles making carousel posts for a sparkling water company. Now makes carousel posts about Win Shares per dollar. The skill set transferred completely. He understood before anyone else on staff that the trade grade letter \u2014 A+ through F \u2014 was the viral hook, not the graph. The graph is what makes the site legitimate. The letter grade is what makes it shareable. That distinction is his entire job. He runs the accounts, designs the content calendar, and builds the carousel templates that turn Katz\u2019s 2,000-word columns into six slides that reach more people than the column ever will. He does not apologize for this. He came to Trade Mapper after seeing a Verdict Flips chart on Twitter that had been screenshotted, cropped badly, reposted without credit, and still gotten 14,000 likes. He emailed the site and said the chart should have been formatted for sharing in the first place. They hired him. He still occasionally uses brand strategy terminology in meetings \u2014 \u201cearned media value,\u201d \u201ccontent velocity,\u201d \u201cshare of voice\u201d \u2014 that nobody else understands. Xu once asked him to define \u201ccontent velocity\u201d in mathematical terms. He has not used the phrase since.`,
    stats: '3 years brand agency \u00b7 Runs all social accounts \u00b7 Designed the carousel template system \u00b7 1 phrase retired after questioning',
  },
  {
    name: 'JAKE LAUFER',
    title: 'Staff Writer',
    bio: `Wrote for Baseline Report, a sports and culture site that launched in 2020, built an audience of 60,000 monthly readers, and folded in 2023 when the venture funding ran out. He was 24. He covered basketball, occasionally football, and once wrote a 4,000-word piece about the architecture of NBA arenas that his editor called \u201cgenuinely beautiful and completely unpublishable\u201d before publishing it anyway. It got 900 reads. At Trade Mapper, he writes the pieces that are too granular for Katz and too long for Herrera \u2014 the 1,200-word trade breakdown that explains why a C+ is actually interesting, or why the third asset in a five-piece deal is the one that will determine the grade in three years. He\u2019s the translator. Xu gives him a statistical finding. He turns it into a sentence a casual fan can read without stopping. Katz gives him a structural argument. He removes the Greek. He is the youngest person on staff by seven years and the only one who has never had a take about Michael Jordan that he\u2019d be willing to defend publicly. He considers this a sign of intellectual honesty. Carlisle considers it a character flaw.`,
    stats: '2.5 years at Baseline Report \u00b7 1 unpublishable arena architecture piece (published, 900 reads) \u00b7 0 public Michael Jordan takes',
  },
  {
    name: 'NATE GERSHON',
    title: 'Salary Cap Analyst',
    bio: `Spent three years as a contracts assistant at a player agency in New York, where his job was to read the Collective Bargaining Agreement until he understood it and then explain it to agents who didn\u2019t want to. He understood it. They didn\u2019t want to. He left when he realized he liked the math more than the relationships, which is a polite way of saying he was not built for a profession that requires dinner reservations. He can recite the luxury tax threshold for any season since 2011 without looking it up. He knows every trade exception, every apron trigger, every mid-level variant. He gets visibly energized when a trade uses a traded player exception \u2014 not because it\u2019s exciting, but because it means someone in a front office understood the mechanism correctly, which he considers rare. At Trade Mapper, he\u2019s the one who flags when a trade\u2019s salary matching is off by $200,000, when a column attributes a trade to \u201ccap flexibility\u201d without specifying which exception created the flexibility, and when the CBA changes in ways that will affect how future trades are structured. He reads the CBA the way Katz reads Homer \u2014 as a text that contains the answers if you\u2019re willing to sit with it long enough. He has a framed printout of Article VII, Section 6 on his wall. Nobody has asked him about it. He is waiting.`,
    stats: '3 years at a player agency \u00b7 Luxury tax thresholds memorized back to 2011 \u00b7 1 framed CBA article (uncommented upon)',
  },
  {
    name: 'SAM OTERO',
    title: 'Creative Director',
    bio: `Previously designed packaging for a mid-tier sneaker brand in Portland \u2014 the kind that sells at Foot Locker but not at the flagship Nike store, which is a distinction that mattered to him more than he\u2019d admit. Now designs share cards, skins, and visual systems for Trade Mapper. The Prizm skin was his idea. He spent three weeks refining the holographic gradient before anyone told him it was fine after two days. It was not fine after two days. The version that shipped on day 21 caught light differently at every angle, which is either a meaningless detail or the entire point of a holographic gradient, depending on whether you\u2019re Sam or everyone else. His portfolio site still lists \u201cNBA Trade Impact Mapper \u2014 Visual Identity & Share Card Systems\u201d above the sneaker work. He designed the Grade Card, the Score Card, and the four visual skins. He also designed the team page you\u2019re reading right now, which he considers his least interesting work and Herrera considers his most important, because it\u2019s the only page on the site where a human face appears. They have agreed to disagree by not discussing it.`,
    stats: '4 years sneaker packaging design \u00b7 Designed all share card skins \u00b7 21-day holographic gradient (non-negotiable) \u00b7 Portfolio: Trade Mapper listed above Nike',
  },
  {
    name: 'JESSE TRAN',
    title: 'Data Engineer',
    bio: `Started as a summer intern writing import scripts. He was supposed to go back to Virginia Tech to finish his computer science degree. That was two years ago. His parents have asked about the degree three times. He has answered three times that he\u2019s \u201ctaking a gap year,\u201d which at this point is a gap era. He\u2019s the one who found the parseFloat(x) || null bug that was storing every player with exactly zero Win Shares as null \u2014 a silent data corruption that affected 340 rows and would have skewed every trade score involving a replacement-level player. He brings this up more than Torretti brings up his F-graded trade. He maintains the data pipeline, writes the scraping scripts, manages the Supabase schema, and is the only person on staff who has SSH\u2019d into the production database at 2 a.m. on a Tuesday because Xu\u2019s query was returning a number that \u201ccouldn\u2019t be right\u201d and was, in fact, right \u2014 the trade was just that bad. He debugs code the way Torretti scouts players: methodically, without ego, and with the quiet confidence of someone who knows the answer is in the logs if you read them carefully enough. He will finish the degree eventually. Probably.`,
    stats: '2 years (ongoing) \u00b7 Found the parseFloat bug (340 rows) \u00b7 1 gap year (extended) \u00b7 3 parental inquiries (deflected)',
  },
];
