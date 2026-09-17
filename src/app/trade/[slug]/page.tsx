import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { allTradeSlugs, resolveTradeSlug } from '@/lib/trade-slugs';
import { loadTradeFromDisk } from '@/lib/trade-data-server';
import { loadTradeVerdict, topAssets, type TradeVerdict } from '@/lib/trade-scores-server';
import { getAnyTeamDisplayInfo } from '@/lib/teams';
import { SITE_URL } from '@/lib/site';
import type { StaticTrade, StaticTradeAsset } from '@/lib/supabase';
import styles from './trade.module.css';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await allTradeSlugs('NBA');
  return slugs.map((slug) => ({ slug }));
}

/** "Oct 27, 2012" */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

/**
 * Roster pages are keyed by the season's END year: /roster/HOU/2013 is 2012-13.
 * Handles the century rollover in seasons like "1999-00".
 */
function seasonEndYear(season: string): number {
  const [startPart, endPart] = season.split('-');
  const start = Number(startPart);
  if (!endPart) return start;
  const century = Math.floor(start / 100) * 100;
  let end = century + Number(endPart);
  if (end < start) end += 100;
  return end;
}

function assetLabel(asset: StaticTradeAsset): string {
  if (asset.type === 'player') return asset.player_name ?? 'Unnamed player';
  if (asset.type === 'cash') return asset.notes?.trim() || 'Cash considerations';

  const round = asset.pick_round ? `R${asset.pick_round}` : 'Pick';
  const year = asset.pick_year ?? '';
  const origin = asset.original_team_id ? ` (${asset.original_team_id})` : '';
  const base = `${year} ${round}${origin}`.trim();
  if (asset.type === 'swap') return `${base} swap`;
  return asset.became_player_name ? `${base} → ${asset.became_player_name}` : base;
}

/** Group every asset by the team that received it, preserving trade order. */
function assetsByReceivingTeam(trade: StaticTrade): Map<string, StaticTradeAsset[]> {
  const grouped = new Map<string, StaticTradeAsset[]>();
  for (const team of trade.teams) grouped.set(team.team_id, []);
  for (const asset of trade.assets) {
    const to = asset.to_team_id;
    if (!to) continue;
    if (!grouped.has(to)) grouped.set(to, []);
    grouped.get(to)!.push(asset);
  }
  return grouped;
}

function describeTrade(trade: StaticTrade, verdict: TradeVerdict | null): string {
  const date = formatDate(trade.date);
  const teamNames = trade.teams
    .map((t) => getAnyTeamDisplayInfo(t.team_id, trade.date).name)
    .join(' and ');

  const headline = topAssets(verdict, 2)
    .map((a) => a.name)
    .filter(Boolean);

  const who = headline.length
    ? `${headline.join(' and ')} changed hands. `
    : '';

  return `${date}: ${teamNames}. ${who}Full asset list, win-share verdict, and the ripple effects across every player and pick involved.`.trim();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveTradeSlug(slug, 'NBA');
  if (!resolved) {
    return { title: 'Trade not found | NBA Trade Mapper' };
  }

  const trade = await loadTradeFromDisk(resolved.id, 'NBA');
  if (!trade) return { title: 'Trade not found | NBA Trade Mapper' };

  const verdict = await loadTradeVerdict(resolved.id);
  const title = trade.title.replace(/\s+Trade$/i, '');
  const fullTitle = `${title} — ${formatDate(trade.date)}`;
  const description = describeTrade(trade, verdict);
  const canonical = `${SITE_URL}/trade/${resolved.canonicalSlug}`;
  const ogImage = `${canonical}/og`;

  return {
    title: `${fullTitle} | NBA Trade Mapper`,
    description,
    alternates: { canonical },
    openGraph: {
      title: fullTitle,
      description,
      url: canonical,
      siteName: 'NBA Trade Mapper',
      type: 'article',
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [ogImage],
    },
  };
}

export default async function TradePage({ params }: PageProps) {
  const { slug } = await params;
  const resolved = await resolveTradeSlug(slug, 'NBA');
  if (!resolved) notFound();

  // Aliases and raw uuids send the reader (and crawlers) to the canonical URL.
  if (resolved.shouldRedirect) redirect(`/trade/${resolved.canonicalSlug}`);

  const trade = await loadTradeFromDisk(resolved.id, 'NBA');
  if (!trade) notFound();

  const verdict = await loadTradeVerdict(resolved.id);
  const grouped = assetsByReceivingTeam(trade);
  const title = trade.title.replace(/\s+Trade$/i, '');

  const scores = verdict?.teamScores ?? {};
  const maxScore = Math.max(
    1,
    ...Object.values(scores).map((s) => Number(s?.score ?? 0)),
  );

  const rosterYear = seasonEndYear(trade.season);

  return (
    <main className={styles.page}>
      <nav className={styles.topNav}>
        <Link href="/" className={styles.backLink}>← NBA Trade Mapper</Link>
      </nav>

      <header className={styles.header}>
        <p className={styles.eyebrow}>
          {formatDate(trade.date)} · {trade.season} season
          {trade.is_multi_team ? ' · multi-team' : ''}
        </p>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.teamPills}>
          {trade.teams.map((t) => {
            const info = getAnyTeamDisplayInfo(t.team_id, trade.date);
            return (
              <span
                key={t.team_id}
                className={styles.teamPill}
                style={{ borderColor: info.color, color: info.color }}
              >
                {info.name}
              </span>
            );
          })}
        </div>
      </header>

      {verdict && Object.keys(scores).length > 0 && (
        <section className={styles.verdict} aria-label="Trade verdict">
          <h2 className={styles.sectionHeading}>Trade Verdict</h2>
          <ul className={styles.verdictList}>
            {Object.entries(scores)
              .sort((a, b) => Number(b[1]?.score ?? 0) - Number(a[1]?.score ?? 0))
              .map(([teamId, entry]) => {
                const info = getAnyTeamDisplayInfo(teamId, trade.date);
                const score = Number(entry?.score ?? 0);
                const pct = Math.max(2, Math.round((score / maxScore) * 100));
                const won = verdict.winner === teamId;
                return (
                  <li key={teamId} className={styles.verdictRow}>
                    <span className={styles.verdictTeam}>
                      {info.abbreviation}
                      {won && <span className={styles.wonTag}>won</span>}
                    </span>
                    <span className={styles.barTrack}>
                      <span
                        className={styles.barFill}
                        style={{ width: `${pct}%`, background: info.color }}
                      />
                    </span>
                    <span className={styles.verdictScore}>{score.toFixed(1)}</span>
                  </li>
                );
              })}
          </ul>
          <p className={styles.verdictNote}>
            Score counts only what each acquired player did in that team&apos;s uniform.{' '}
            <Link href="/methodology" className={styles.inlineLink}>
              How we score trades →
            </Link>
          </p>
        </section>
      )}

      <section aria-label="Assets exchanged">
        <h2 className={styles.sectionHeading}>Who Got What</h2>
        <div className={styles.columns}>
          {[...grouped.entries()].map(([teamId, assets]) => {
            const info = getAnyTeamDisplayInfo(teamId, trade.date);
            return (
              <div key={teamId} className={styles.column}>
                <h3 className={styles.columnHeading} style={{ color: info.color }}>
                  {info.name} receive
                </h3>
                {assets.length === 0 ? (
                  <p className={styles.emptyAssets}>No incoming assets recorded.</p>
                ) : (
                  <ul className={styles.assetList}>
                    {assets.map((asset, i) => (
                      <li key={`${teamId}-${i}`} className={styles.assetItem}>
                        <span className={styles.assetName}>{assetLabel(asset)}</span>
                        <span className={styles.assetType}>{asset.type}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.cta} aria-label="Keep exploring">
        <Link href={`/?trade=${trade.id}`} className={styles.primaryCta}>
          Open this trade in the graph →
        </Link>
        <p className={styles.ctaNote}>
          Follow every player and pick forward through the trades that came after.
        </p>
      </section>

      <section aria-label="Related pages">
        <h2 className={styles.sectionHeading}>Related</h2>
        <ul className={styles.relatedList}>
          {trade.teams.map((t) => {
            const info = getAnyTeamDisplayInfo(t.team_id, trade.date);
            return (
              <li key={t.team_id}>
                <Link
                  href={`/roster/${t.team_id}/${rosterYear}`}
                  className={styles.inlineLink}
                >
                  {info.name} {trade.season} roster — how it was built
                </Link>
              </li>
            );
          })}
          <li>
            <Link href="/explore/heist-index" className={styles.inlineLink}>
              Heist Index — the most lopsided trades ever
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
