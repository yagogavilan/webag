import { expect, test } from '@playwright/test';
import { login, seedStoreInReview } from './helpers';

/**
 * QA R1.1 (2026-11-22, BUG-041): as páginas de servidor `app/admin/(painel)/lojas/[id]/page.tsx` e `.../ver-como/page.tsx` chamam `isStoreTab` e `isViewAsTab`,
 * funções exportadas de módulos 'use client'. No build de produção o React recusa ("Attempted to call isStoreTab() from the server") e a página devolve "This page couldn't load".
 * O teste de componente (jsdom) não vê isso: só o navegador contra o build. Enquanto o bug estiver aberto os casos ficam em `test.fail` (o Playwright os dá como passados);
 * quando o dev corrigir, o Playwright avisa "esperava falhar e passou": remover o `test.fail` e deixar como regressão.
 */
test.describe('QA R1.1: ficha 360 e Ver como abrem no build de produção', () => {
  test('GET /admin/lojas/{id} (ficha 360) renderiza sem a tela de erro do servidor', async ({ page }) => {
    test.fail(true, 'BUG-041: isStoreTab (módulo client) chamado em página de servidor');
    const store = await seedStoreInReview(`Loja QA Ficha ${Date.now() % 10_000}`);
    await login(page, 'admin@webag.local');
    await page.goto(`/admin/lojas/${store.id}`);
    await expect(page.getByRole('heading', { name: /This page couldn.t load/ })).toHaveCount(0);
  });

  test('GET /admin/lojas/{id}/ver-como renderiza sem a tela de erro do servidor', async ({ page }) => {
    test.fail(true, 'BUG-041: isViewAsTab (módulo client) chamado em página de servidor');
    const store = await seedStoreInReview(`Loja QA VerComo ${Date.now() % 10_000}`);
    await login(page, 'admin@webag.local');
    await page.goto(`/admin/lojas/${store.id}/ver-como`);
    await expect(page.getByRole('heading', { name: /This page couldn.t load/ })).toHaveCount(0);
  });
});
