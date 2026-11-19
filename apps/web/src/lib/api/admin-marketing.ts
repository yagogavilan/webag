import type { AdminBanner, AdminBannerList, CreateBannerRequest, Highlight, HighlightCreate, HighlightList, HighlightPatch, PlatformCoupon, PlatformCouponCreate, PlatformCouponPage, PlatformCouponPatch, PushCampaign, PushCampaignCreate, PushCampaignPage, PushEstimate, PushSegment, UpdateBannerRequest } from '@webag/shared';
import { apiRequest } from './client';
import { postToStorage } from '@/lib/image/upload';

/** Marketing do admin (Onda 6): banners e destaques, push segmentado e cupons da plataforma. Tipos do contrato gerado. */
export type { AdminBanner, CreateBannerRequest, Highlight, HighlightCreate, PlatformCoupon, PlatformCouponCreate, PushCampaign, PushCampaignCreate, PushEstimate, PushSegment };
const A = 'admin' as const;

export const marketingApi = {
  banners: () => apiRequest<AdminBannerList>(A, 'admin/banners'),
  createBanner: (body: CreateBannerRequest) => apiRequest<AdminBanner>(A, 'admin/banners', { method: 'POST', body }),
  updateBanner: (id: string, body: UpdateBannerRequest) => apiRequest<AdminBanner>(A, `admin/banners/${id}`, { method: 'PATCH', body }),
  deleteBanner: (id: string) => apiRequest<void>(A, `admin/banners/${id}`, { method: 'DELETE' }),
  highlights: () => apiRequest<HighlightList>(A, 'admin/highlights'),
  createHighlight: (body: HighlightCreate) => apiRequest<Highlight>(A, 'admin/highlights', { method: 'POST', body }),
  updateHighlight: (id: string, body: HighlightPatch) => apiRequest<Highlight>(A, `admin/highlights/${id}`, { method: 'PATCH', body }),
  deleteHighlight: (id: string) => apiRequest<void>(A, `admin/highlights/${id}`, { method: 'DELETE' }),
  pushEstimate: (segment: PushSegment) => apiRequest<PushEstimate>(A, 'admin/push/estimate', { method: 'POST', body: { segment } }),
  pushCampaigns: (cursor?: string) => apiRequest<PushCampaignPage>(A, 'admin/push/campaigns', { query: { cursor, limit: 30 } }),
  createCampaign: (body: PushCampaignCreate, idempotencyKey: string) => apiRequest<PushCampaign>(A, 'admin/push/campaigns', { method: 'POST', body, idempotencyKey }),
  cancelCampaign: (id: string, reason: string) => apiRequest<PushCampaign>(A, `admin/push/campaigns/${id}/cancel`, { method: 'POST', body: { reason } }),
  coupons: (cursor?: string) => apiRequest<PlatformCouponPage>(A, 'admin/coupons', { query: { cursor, limit: 50 } }),
  createCoupon: (body: PlatformCouponCreate) => apiRequest<PlatformCoupon>(A, 'admin/coupons', { method: 'POST', body }),
  updateCoupon: (id: string, body: PlatformCouponPatch) => apiRequest<PlatformCoupon>(A, `admin/coupons/${id}`, { method: 'PATCH', body }),
  /** Imagem do banner (2:1): política, armazenamento, confirmação (ADR-005). Devolve o `assetId` para criar o banner. */
  uploadBannerImage: async (blob: Blob, fileName: string): Promise<string> => {
    const created = await apiRequest<{ id: string; upload: { url: string; fields: Record<string, string> } }>(A, 'uploads', { method: 'POST', body: { purpose: 'banner', contentType: blob.type || 'image/jpeg', sizeBytes: blob.size } });
    await postToStorage({ uploadId: created.id, url: created.upload.url, fields: created.upload.fields }, blob, fileName);
    const asset = await apiRequest<{ id: string; status: string; rejectionReason: string | null }>(A, `uploads/${created.id}/complete`, { method: 'POST' });
    if (asset.status === 'rejected' || asset.rejectionReason) throw new Error(asset.rejectionReason ?? 'Imagem recusada. Use outra.');
    return asset.id;
  },
};

export const marketingKeys = {
  banners: ['admin', 'banners'] as const,
  highlights: ['admin', 'highlights'] as const,
  campaigns: ['admin', 'push', 'campaigns'] as const,
  coupons: ['admin', 'coupons'] as const,
};

export const PUSH_WINDOW = 'entre 9h e 20h';
