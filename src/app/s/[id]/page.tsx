import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import SharedGraphClient from './SharedGraphClient';

// Server-side Supabase client for metadata generation
function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

interface PageProps {
  params: Promise<{ id: string }>;
}

// Dynamic OG metadata for unfurling on X, Discord, iMessage
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const sb = getServerSupabase();
  const { data } = await sb
    .from('shared_graphs')
    .select('title, subtitle, teams, league')
    .eq('id', id)
    .single();

  if (!data) {
    return {
      title: 'NBA Trade Mapper',
      description: 'Trace the ripple effects of NBA trades across time',
    };
  }

  const title = data.title || 'NBA Trade Mapper';
  const description = data.subtitle || 'Explore this trade on NBA Trade Mapper';

  return {
    title: `${title} — NBA Trade Mapper`,
    description,
    openGraph: {
      title,
      description,
      siteName: 'NBA Trade Mapper',
      type: 'website',
      images: [`/s/${id}/og`],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`/s/${id}/og`],
    },
  };
}

export default async function SharedGraphPage({ params }: PageProps) {
  const { id } = await params;
  return <SharedGraphClient shareId={id} />;
}
