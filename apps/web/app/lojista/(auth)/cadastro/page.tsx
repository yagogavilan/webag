import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignupForm } from '@/features/lojista/signup-form';
import { callApi, parseJson } from '@/server/upstream';

export const metadata: Metadata = { title: 'Cadastre sua loja' };

/** A flag `cadastro_lojista` é lida no servidor: a tela já nasce certa, sem piscar o formulário (L1 C3). Falha de leitura = aberto. */
async function signupOpen(): Promise<boolean> {
  const result = await callApi('/v1/config/flags');
  const flags = result.status === 200 ? parseJson<{ flags?: Record<string, boolean> }>(result.text)?.flags : undefined;
  return flags?.['cadastro_lojista'] !== false;
}

export default async function Page() {
  const open = await signupOpen();
  return (
    <Suspense>
      <SignupForm signupOpen={open} />
    </Suspense>
  );
}
