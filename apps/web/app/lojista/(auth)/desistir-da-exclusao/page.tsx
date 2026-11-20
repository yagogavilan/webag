import type { Metadata } from 'next';
import { CancelDeletionForm } from '@/features/auth/cancel-deletion-form';

export const metadata: Metadata = { title: 'Desistir da exclusão' };

export default function Page() {
  return <CancelDeletionForm />;
}
