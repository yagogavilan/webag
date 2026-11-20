import { useInfiniteQuery } from '@tanstack/react-query';
import type { ListMyCouponsStatus } from '@webag/shared';
import { fetchMyCoupons } from '../../api/coupons-api';
import { useSession } from '../../api/session';

export const couponsKey = (status: ListMyCouponsStatus) => ['me', 'coupons', status] as const;

export function useMyCoupons(status: ListMyCouponsStatus) {
  const session = useSession();
  return useInfiniteQuery({
    queryKey: couponsKey(status),
    queryFn: ({ pageParam, signal }) => fetchMyCoupons(status, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: session.status === 'authenticated',
    staleTime: 15_000,
  });
}
