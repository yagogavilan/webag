'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Banner } from '@/components/ui';
import { apiRequest, type Area } from '@/lib/api/client';
import { MAINTENANCE_TITLE, expectedBackText, isMaintenanceOn, maintenanceText, type MaintenanceStatus } from '@/lib/maintenance';

export const maintenanceKey = (area: Area) => [area, 'maintenance'] as const;

/**
 * Estado do modo manutenção para o aviso dos painéis. Admin lê `admin/maintenance` (todo perfil); o lojista lê o público `config/maintenance`.
 * Erro é silencioso: sem resposta, sem aviso.
 */
export function useMaintenance(area: Area): MaintenanceStatus | null {
  const query = useQuery({
    queryKey: maintenanceKey(area),
    queryFn: () => apiRequest<MaintenanceStatus>(area, area === 'admin' ? 'admin/maintenance' : 'config/maintenance'),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  return isMaintenanceOn(query.data) ? query.data : null;
}

/** Aviso do admin: qualquer perfil vê que a plataforma está em manutenção; só o super admin tem o link para desligar. */
export function AdminMaintenanceBanner({ canManage }: { canManage: boolean }) {
  const status = useMaintenance('admin');
  if (!status) return null;
  const back = expectedBackText(status.expectedBackAt);
  return (
    <Banner tone="warning" testId="admin.maintenance.banner" action={canManage ? <Link href="/admin/manutencao" className="wb-text-body-strong" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Abrir o modo manutenção</Link> : undefined}>
      <strong>Modo manutenção ligado.</strong> Clientes não conseguem fazer pedidos novos. {back ?? ''} O painel segue funcionando.
    </Banner>
  );
}

/** Aviso do lojista: o que continua funcionando (pedidos já pagos) e o que para (pedidos novos). */
export function LojistaMaintenanceBanner() {
  const status = useMaintenance('lojista');
  if (!status) return null;
  const back = expectedBackText(status.expectedBackAt);
  return (
    <Banner tone="warning" testId="lojista.maintenance.banner">
      <strong>{MAINTENANCE_TITLE}: o Webag está em manutenção.</strong> {maintenanceText(status)} Novos pedidos estão pausados. Os pedidos já pagos continuam com você. {back ?? ''}
    </Banner>
  );
}
