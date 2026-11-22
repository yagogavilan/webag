// Sem 'use client' de propósito: a página de servidor `app/admin/.../ver-como/page.tsx` chama `isViewAsTab` (BUG-041).
export type ViewAsTab = 'ped' | 'prod' | 'mais' | 'troca' | 'aval' | 'loja';

export const VIEW_AS_TITLES: Record<ViewAsTab, string> = { ped: 'Pedidos', prod: 'Produtos', mais: 'Mais', troca: 'Trocas', aval: 'Avaliações', loja: 'Dados da loja' };

export const isViewAsTab = (value: string | undefined): value is ViewAsTab => value !== undefined && Object.hasOwn(VIEW_AS_TITLES, value);
