export type AdminProfile = 'super_admin' | 'operations' | 'finance' | 'support';

/** Resposta de GET /v1/me (contrato provisório: ver docs/arquitetura/divida-tecnica.md, DT-014). */
export interface Me {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  phone: string | null;
  roles: string[];
  adminProfile: AdminProfile | null;
}

export type SessionState =
  | { status: 'anonymous' }
  | { status: 'mfa_setup' }
  | { status: 'ok'; user: Me };
