import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { slugToCategoryId, slugToTitle, EXPLORE_SLUGS } from '@/lib/discovery/slugs';
import ExploreCategoryClient from './ExploreCategoryClient';

interface PageProps {
  params: Promise<{ category: string }>;
}

export function generateStaticParams() {
  return EXPLORE_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const title = slugToTitle(category);

  if (!title) {
    return {
      title: 'NBA Trade Mapper',
      description: 'Trace the ripple effects of NBA trades across time',
    };
  }

  const description = `${title} — explore the trades ranked by this metric on NBA Trade Mapper.`;

  return {
    title: `${title} — NBA Trade Mapper`,
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

export default async function ExploreCategoryPage({ params }: PageProps) {
  const { category } = await params;
  const categoryId = slugToCategoryId(category);
  if (!categoryId) notFound();

  return (
    <Suspense fallback={null}>
      <ExploreCategoryClient categoryId={categoryId} />
    </Suspense>
  );
}
