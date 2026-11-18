import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MerchantLoginForm } from '@/features/auth/merchant-login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default function Page() {
  return (
    <Suspense>
      <MerchantLoginForm />
    </Suspense>
  );
}
