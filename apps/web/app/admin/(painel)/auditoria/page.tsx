import type { Metadata } from 'next';
import { AuditPage } from '@/features/audit/audit-page';

export const metadata: Metadata = { title: 'Auditoria' };

export default async function Page({ searchParams }: { searchParams: Promise<{ targetType?: string; targetId?: string }> }) {
  const { targetType, targetId } = await searchParams;
  return <AuditPage initial={{ targetType: typeof targetType === 'string' ? targetType : undefined, targetId: typeof targetId === 'string' ? targetId : undefined }} />;
}
