'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { canEdit, canView, type AdminSection } from '@/lib/admin-access';
import { can, type AdminPermission } from '@/lib/admin-permissions';
import type { Me } from '@/lib/session-types';

interface Value {
  user: Me;
  canView: (section: AdminSection) => boolean;
  canEdit: (section: AdminSection) => boolean;
  /** WB-355: permissão da API (`x-admin-permission`) para o perfil logado. A tela só reflete; a API barra de verdade. */
  can: (permission: AdminPermission) => boolean;
}

const SessionContext = createContext<Value | null>(null);

export function SessionProvider({ user, children }: { user: Me; children: ReactNode }) {
  const value: Value = {
    user,
    canView: (section) => canView(user.adminProfile, section),
    canEdit: (section) => canEdit(user.adminProfile, section),
    can: (permission) => can(user.adminProfile, permission),
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Value {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora do SessionProvider');
  return value;
}
