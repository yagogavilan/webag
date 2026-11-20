import { getMe, updateMe, type Me } from '@webag/shared';
import { request } from './http';

/** Perfil da conta (`/v1/me`). Só `name` e `phone` são editáveis; e-mail e senha têm fluxo próprio com confirmação (CC2). */
export const fetchMe = (signal?: AbortSignal): Promise<Me> => request((init) => getMe(init), { retry: true, ...(signal ? { signal } : {}) });

export const saveProfile = (body: { name?: string; phone?: string }): Promise<Me> => request((init) => updateMe(body, init));
