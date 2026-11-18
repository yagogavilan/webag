import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AreaShell } from '@/components/area-shell';
import { PANEL_AREAS } from '@/lib/areas';

const area = PANEL_AREAS.admin;

export const metadata: Metadata = { title: area.title };

export default function Layout({ children }: { children: ReactNode }) {
  return <AreaShell area={area}>{children}</AreaShell>;
}
