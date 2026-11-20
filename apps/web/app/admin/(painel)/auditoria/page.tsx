import type { Metadata } from 'next';
import { AuditPage } from '@/features/audit/audit-page';

export const metadata: Metadata = { title: 'Auditoria' };

export default async function Page({ searchParams }: { searchParams: Promise<{ targetType?: string; targetId?: string; actorId?: string }> }) {
  const { targetType, targetId, actorId } = await searchParams;
  return <AuditPage initial={{ targetType: typeof targetType === 'string' ? targetType : undefined, targetId: typeof targetId === 'string' ? targetId : undefined, actorId: typeof actorId === 'string' ? actorId : undefined }} />;
}
