import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OnboardingPage } from '@/features/lojista/onboarding/onboarding-page';
import { ONBOARDING_STEPS, type OnboardingStep } from '@/lib/lojista-access';

export const metadata: Metadata = { title: 'Cadastro da loja' };

const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export default async function Page({ params, searchParams }: { params: Promise<{ etapa: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { etapa } = await params;
  if (!(ONBOARDING_STEPS as readonly string[]).includes(etapa)) notFound();
  const query = await searchParams;
  return (
    <OnboardingPage
      step={etapa as OnboardingStep}
      fromReview={one(query['de']) === 'revisao'}
      correction={one(query['correcao']) === '1'}
      oauth={{ state: one(query['state']), code: one(query['code']), denied: one(query['error']) === 'access_denied' }}
    />
  );
}
