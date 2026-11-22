import { planItem, type AdminBulkAction, type PlanVariant } from './admin-bulk.js';

const active = { status: 'active', moderationStatus: 'ok' };
const one = (stock: number, reserved = 0): PlanVariant[] => [{ stock, reserved }];

describe('planItem (ação em massa do admin, WB-353 C6)', () => {
  it.each([
    ['pausar produto ativo', { type: 'pause' }, active, one(5), { kind: 'status', to: 'paused' }],
    ['pausar o que já está pausado não é alteração', { type: 'pause' }, { status: 'paused', moderationStatus: 'ok' }, one(5), { kind: 'noop' }],
    ['reativar produto pausado', { type: 'resume' }, { status: 'paused', moderationStatus: 'ok' }, one(5), { kind: 'status', to: 'active' }],
    ['reativar o que já está ativo não é alteração', { type: 'resume' }, active, one(5), { kind: 'noop' }],
    ['reativar o que a moderação pausou é bloqueado', { type: 'resume' }, { status: 'paused', moderationStatus: 'paused' }, one(5), { kind: 'blocked', reason: 'PRODUCT_MODERATED' }],
    ['reativar o que a moderação removeu é bloqueado', { type: 'resume' }, { status: 'paused', moderationStatus: 'removed' }, one(5), { kind: 'blocked', reason: 'PRODUCT_MODERATED' }],
    ['rascunho é NOT_ACTIVE em qualquer ação', { type: 'pause' }, { status: 'draft', moderationStatus: 'ok' }, one(5), { kind: 'blocked', reason: 'NOT_ACTIVE' }],
    ['arquivado é NOT_ACTIVE em qualquer ação', { type: 'stock_set', value: 1 }, { status: 'archived', moderationStatus: 'ok' }, one(5), { kind: 'blocked', reason: 'NOT_ACTIVE' }],
    ['estoque definido', { type: 'stock_set', value: 3 }, active, one(10), { kind: 'stock', from: 10, to: 3 }],
    ['estoque somado', { type: 'stock_adjust', value: 5 }, active, one(10), { kind: 'stock', from: 10, to: 15 }],
    ['estoque no mesmo valor não é alteração', { type: 'stock_set', value: 10 }, active, one(10), { kind: 'noop' }],
    ['ajuste zero não é alteração', { type: 'stock_adjust', value: 0 }, active, one(10), { kind: 'noop' }],
    ['abaixo do reservado (RN-06)', { type: 'stock_set', value: 2 }, active, one(10, 3), { kind: 'blocked', reason: 'STOCK_BELOW_RESERVED' }],
    ['igual ao reservado passa', { type: 'stock_set', value: 3 }, active, one(10, 3), { kind: 'stock', from: 10, to: 3 }],
    ['negativo é bloqueado', { type: 'stock_adjust', value: -11 }, active, one(10), { kind: 'blocked', reason: 'STOCK_BELOW_RESERVED' }],
    ['acima de 99.999 é bloqueado', { type: 'stock_adjust', value: 99_999 }, active, one(10), { kind: 'blocked', reason: 'STOCK_BELOW_RESERVED' }],
    ['grade (2 variações) não recebe estoque em massa', { type: 'stock_set', value: 3 }, active, [...one(5), ...one(5)], { kind: 'blocked', reason: 'MULTIPLE_VARIANTS' }],
    ['sem variação ativa não tem estoque a ajustar', { type: 'stock_set', value: 3 }, active, [], { kind: 'blocked', reason: 'NOT_ACTIVE' }],
    ['grade pode ser pausada normalmente', { type: 'pause' }, active, [...one(5), ...one(5)], { kind: 'status', to: 'paused' }],
  ] as [string, AdminBulkAction, { status: string; moderationStatus: string }, PlanVariant[], unknown][])('%s', (_name, action, product, variants, expected) => {
    expect(planItem(action, product, variants)).toEqual(expected);
  });
});
