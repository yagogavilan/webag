// Sem 'use client' de propósito: as páginas de servidor (`app/admin/.../lojas/[id]/page.tsx`) chamam `isStoreTab`.
// Função exportada de módulo 'use client' vira referência de cliente e não pode ser chamada no servidor (BUG-041).
export type StoreTabId = 'resumo' | 'horario' | 'dados' | 'documentos' | 'historico';

const STORE_TABS: readonly string[] = ['resumo', 'horario', 'dados', 'documentos', 'historico'];

export const isStoreTab = (value: string | undefined): value is StoreTabId => value !== undefined && STORE_TABS.includes(value);
