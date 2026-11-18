'use client';

import { Compass } from '@phosphor-icons/react';
import { MessageState } from '@/components/ui';
import { PageHeader } from './page-header';

export function EmptyHome() {
  return (
    <>
      <PageHeader title="Visão geral" />
      <MessageState icon={Compass} title="Seu perfil ainda não tem telas disponíveis" text="As áreas de financeiro e suporte chegam nas próximas ondas." testId="admin.home.empty" />
    </>
  );
}
