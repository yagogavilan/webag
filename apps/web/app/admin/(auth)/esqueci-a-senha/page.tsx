import type { Metadata } from 'next';
import { ForgotForm } from '@/features/auth/forgot-form';

export const metadata: Metadata = { title: 'Esqueci a senha' };

export default function Page() {
  return <ForgotForm />;
}
