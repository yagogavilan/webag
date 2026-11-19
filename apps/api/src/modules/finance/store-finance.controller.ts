import { csvCell } from '../../platform/http/csv.js';
import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Ctx, StorePermission, type RequestContext } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AuditService } from '../admin/index.js';
import { errors } from '../../platform/http/app-error.js';
import { StoreFinanceService, type StatementLine } from './store-finance.service.js';

/** Local (não importa de `stores`): `stores` depende de `finance` (comissão efetiva) e o ciclo derrubaria o boot. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidParam = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};

const period = z
  .strictObject({ from: z.iso.date(), to: z.iso.date(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() })
  .refine((v) => v.from <= v.to, { message: 'O início do período não pode ser depois do fim.', path: ['from'] })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 366, { message: 'Período de no máximo 366 dias.', path: ['to'] });

/** Reais com vírgula decimal (planilha em pt-BR); valores em centavos continuam no JSON. */
const reais = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');
/** Neutraliza fórmulas de planilha (`=`, `+`, `-`, `@`) como na exportação da auditoria. */
const cell = (value: string): string => csvCell(value);
const BOM = String.fromCharCode(0xfeff);
const PAYOUT_LABEL = { pending: 'a receber', in_grace: 'em carencia', released: 'liberado' } as const;

function statementCsv(lines: StatementLine[]): string {
  const header = ['pedido', 'pago_em', 'status_pedido', 'vendas', 'comissao', 'taxa_provedor', 'estornos', 'liquido', 'situacao'];
  const rows = lines.map((l) => [cell(l.number), l.paidAt, l.orderStatus, reais(l.gross.amount), reais(l.commission.amount), reais(l.providerFee.amount), reais(l.refunds.amount), reais(l.net.amount), PAYOUT_LABEL[l.payoutStatus]].join(';'));
  return `${BOM}${[header.join(';'), ...rows].join('\r\n')}\r\n`;
}

/**
 * Financeiro da loja (WB-075 a WB-077, RN-10, RN-13). Comissão, líquido e extrato são do DONO (`finance`); o funcionário com a
 * permissão `sales_values` vê só o total de vendas, sem comissão nem líquido. Loja de outra conta: 404 (SEC-020).
 */
@Controller('v1/stores/:storeId/finance')
export class StoreFinanceController {
  constructor(
    private readonly finance: StoreFinanceService,
    private readonly audit: AuditService,
  ) {}

  @StorePermission('sales_values')
  @Get('sales')
  sales(@Param('storeId') storeId: string, @Query(new ZodPipe(period)) q: z.infer<typeof period>) {
    return this.finance.sales(uuidParam(storeId), q.from, q.to);
  }

  /** Série diária (gráfico "Vendas por dia"); mesma permissão e definição de `sales`. */
  @StorePermission('sales_values')
  @Get('sales/daily')
  salesDaily(@Param('storeId') storeId: string, @Query(new ZodPipe(period)) q: z.infer<typeof period>) {
    return this.finance.salesDaily(uuidParam(storeId), q.from, q.to);
  }

  /** W.6: mais vendidos do período (Início do lojista): nome, imagem, unidades e "você recebe". `limit` de 1 a 20 (padrão 5). */
  @StorePermission('sales_values')
  @Get('sales/top-products')
  topProducts(@Param('storeId') storeId: string, @Query(new ZodPipe(period)) q: z.infer<typeof period>) {
    const limit = q.limit === undefined ? 5 : Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw errors.validation([{ field: 'limit', message: 'Use de 1 a 20.' }]);
    return this.finance.topProducts(uuidParam(storeId), q.from, q.to, limit);
  }

  @StorePermission('finance')
  @Get('summary')
  summary(@Param('storeId') storeId: string, @Query(new ZodPipe(period)) q: z.infer<typeof period>) {
    return this.finance.summary(uuidParam(storeId), q.from, q.to);
  }

  @StorePermission('finance')
  @Get('statement')
  statement(@Param('storeId') storeId: string, @Query(new ZodPipe(period)) q: z.infer<typeof period>) {
    return this.finance.statement(uuidParam(storeId), q.from, q.to, q);
  }

  /** Extrato exportável (até 5.000 pedidos mais recentes do período). A exportação entra na auditoria. */
  @StorePermission('finance')
  @RateLimit({ name: 'store-finance-export', limit: 20, windowSeconds: 3600 })
  @Get('statement.csv')
  async csv(@Param('storeId') storeId: string, @Query(new ZodPipe(period)) q: z.infer<typeof period>, @Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response): Promise<string> {
    const id = uuidParam(storeId);
    const lines = await this.finance.statementAll(id, q.from, q.to);
    await this.audit.recordStandalone(ctx, { action: 'store.finance.export', targetType: 'store', targetId: id, after: { from: q.from, to: q.to, rows: lines.length } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="extrato-${q.from}-${q.to}.csv"`);
    return statementCsv(lines);
  }
}
