import { getPublicMaintenance, type MaintenanceStatus } from '@webag/shared';
import { request } from './http';

/** Modo manutenção (WB-121), público e com cache de 15 s no servidor. Sem login: vale até na tela de entrada. */
export const fetchMaintenance = (signal?: AbortSignal): Promise<MaintenanceStatus> =>
  request((init) => getPublicMaintenance(init), { auth: 'none', retry: true, ...(signal ? { signal } : {}) });
