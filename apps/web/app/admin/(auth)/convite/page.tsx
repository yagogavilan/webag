import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InviteForm } from '@/features/auth/invite-form';

export const metadata: Metadata = { title: 'Convite', referrer: 'no-referrer' };

export default function Page() {
  return (
    <Suspense>
      <InviteForm />
    </Suspense>
  );
}
