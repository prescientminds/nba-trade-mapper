import type { Metadata } from 'next';
import { TEAMS } from '@/lib/teams';
import RosterClient from './RosterClient';

interface PageProps {
  params: Promise<{ teamId: string; year: string }>;
}

function yearToSeason(year: string): string | null {
  const endYear = parseInt(year, 10);
  if (!Number.isFinite(endYear) || endYear < 1950 || endYear > 2100) return null;
  const startYear = endYear - 1;
  const suffix = String(endYear).slice(-2);
  return `${startYear}-${suffix}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { teamId, year } = await params;
  const team = TEAMS[teamId];
  const season = yearToSeason(year);

  if (!team || !season) {
    return {
      title: 'Roster | NBA Trade Mapper',
    };
  }

  const title = `${season} ${team.name} — Roster Composition`;
  const description = `How every player on the ${season} ${team.name} was acquired — trades, draft, free agency.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'NBA Trade Mapper',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function RosterPage({ params }: PageProps) {
  const { teamId, year } = await params;
  const season = yearToSeason(year) ?? '';
  return <RosterClient teamId={teamId} season={season} />;
}
