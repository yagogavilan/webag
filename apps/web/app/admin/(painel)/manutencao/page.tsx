import type { Metadata } from 'next';
import { MaintenancePage } from '@/features/admin-ops/maintenance-page';

export const metadata: Metadata = { title: 'Modo manutenção' };

export default function Page() {
  return <MaintenancePage />;
}
