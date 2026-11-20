'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { canEdit, canView, type AdminSection } from '@/lib/admin-access';
import type { Me } from '@/lib/session-types';

interface Value {
  user: Me;
  canView: (section: AdminSection) => boolean;
  canEdit: (section: AdminSection) => boolean;
}

const SessionContext = createContext<Value | null>(null);

export function SessionProvider({ user, children }: { user: Me; children: ReactNode }) {
  const value: Value = {
    user,
    canView: (section) => canView(user.adminProfile, section),
    canEdit: (section) => canEdit(user.adminProfile, section),
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Value {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora do SessionProvider');
  return value;
}
