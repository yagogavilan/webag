import type { Metadata } from 'next';
import { StoreMenu } from '@/features/loja/store-menu';

export const metadata: Metadata = { title: 'Minha loja' };

export default function Page() {
  return <StoreMenu />;
}
