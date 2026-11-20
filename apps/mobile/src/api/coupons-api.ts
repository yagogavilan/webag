import { listMyCoupons, type ListMyCouponsStatus, type MyCouponPage } from '@webag/shared';
import { request } from './http';

/** Cupons pessoais da conta (`GET /v1/me/coupons`, WB-254): hoje, a compensação por atraso. O app só lê; quem valida o uso é a sacola. */
export const fetchMyCoupons = (status: ListMyCouponsStatus, cursor?: string | null, signal?: AbortSignal): Promise<MyCouponPage> =>
  request((init) => listMyCoupons({ status, limit: 20, ...(cursor ? { cursor } : {}) }, init), { retry: true, ...(signal ? { signal } : {}) });
