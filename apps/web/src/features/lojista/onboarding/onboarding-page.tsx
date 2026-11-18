'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { QueryBoundary, SkeletonRows } from '@/components/ui';
import type { MerchantStore } from '@/lib/api/lojista';
import { onboardingPath, resumeStep, type OnboardingStep } from '@/lib/lojista-access';
import { useMerchant } from '../store-context';
import { Review } from './review';
import { Step1 } from './step1';
import { Step2 } from './step2';
import { Step3 } from './step3';
import { Step4 } from './step4';

interface Props {
  step: OnboardingStep;
  /** Veio do "Editar" da revisão: ao salvar, volta à revisão (onda-2 L7). */
  fromReview?: boolean;
  /** Correção pedida pelo admin: ao salvar, volta ao acompanhamento. */
  correction?: boolean;
  oauth?: { state?: string | undefined; code?: string | undefined; denied?: boolean | undefined };
}

const NEXT: Record<'1' | '2' | '3' | '4', OnboardingStep> = { '1': '2', '2': '3', '3': '4', '4': 'revisao' };
const PREVIOUS: Record<OnboardingStep, OnboardingStep | null> = { '1': null, '2': '1', '3': '2', '4': '3', revisao: '4' };

/** Para onde a tela deve estar, dado o estado do cadastro. `null` = aqui mesmo. */
export function onboardingRedirect(store: MerchantStore | null, step: OnboardingStep, correction: boolean): string | null {
  if (store?.role === 'staff') return '/lojista';
  if (store && store.status !== 'draft') {
    if (store.status === 'in_review' && step === 'revisao') return null;
    if (store.status === 'correction_requested' && correction && (step === '1' || step === '2')) return null;
    return '/lojista';
  }
  const done = store?.step ?? 0;
  const wanted = step === 'revisao' ? 5 : Number(step);
  return wanted > done + 1 ? onboardingPath(resumeStep(store)) : null;
}

/** L3 a L7: guarda de ordem (não pula etapa), retomada do rascunho e navegação entre as etapas. */
export function OnboardingPage({ step, fromReview, correction, oauth }: Props) {
  const router = useRouter();
  const { store: query } = useMerchant();
  const target = query.data !== undefined ? onboardingRedirect(query.data, step, Boolean(correction)) : null;

  useEffect(() => {
    if (target) router.replace(target as never);
  }, [target, router]);

  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={4} height={64} label="Carregando seu cadastro" />}>
      {(store) => {
        if (target) return <SkeletonRows rows={2} height={64} label="Abrindo a etapa certa" />;
        const previous = PREVIOUS[step];
        const backHref = correction || fromReview ? (step === 'revisao' ? onboardingPath('4') : correction ? '/lojista' : onboardingPath('revisao')) : previous ? onboardingPath(previous) : undefined;
        const next = correction ? '/lojista' : fromReview && step !== 'revisao' ? onboardingPath('revisao') : step === 'revisao' ? '/lojista' : onboardingPath(NEXT[step]);
        switch (step) {
          case '1':
            return <Step1 store={store} next={next} backHref={backHref} />;
          case '2':
            return <Step2 store={store} next={next} backHref={backHref} />;
          case '3':
            return store ? <Step3 store={store} next={next} backHref={backHref} /> : null;
          case '4':
            return store ? <Step4 store={store} next={next} backHref={backHref} oauth={oauth} /> : null;
          case 'revisao':
            return store ? <Review store={store} backHref={backHref} /> : null;
        }
      }}
    </QueryBoundary>
  );
}
