var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { csvCell } from '../../platform/http/csv.js';
import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, StorePermission } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AuditService } from '../admin/index.js';
import { errors } from '../../platform/http/app-error.js';
import { StoreFinanceService } from './store-finance.service.js';
/** Local (não importa de `stores`): `stores` depende de `finance` (comissão efetiva) e o ciclo derrubaria o boot. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidParam = (value) => {
    if (!UUID.test(value))
        throw errors.notFound();
    return value;
};
const period = z
    .strictObject({ from: z.iso.date(), to: z.iso.date(), cursor: z.string().max(200).optional(), limit: z.string().max(4).optional() })
    .refine((v) => v.from <= v.to, { message: 'O início do período não pode ser depois do fim.', path: ['from'] })
    .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 366, { message: 'Período de no máximo 366 dias.', path: ['to'] });
/** Reais com vírgula decimal (planilha em pt-BR); valores em centavos continuam no JSON. */
const reais = (cents) => (cents / 100).toFixed(2).replace('.', ',');
/** Neutraliza fórmulas de planilha (`=`, `+`, `-`, `@`) como na exportação da auditoria. */
const cell = (value) => csvCell(value);
const BOM = String.fromCharCode(0xfeff);
const PAYOUT_LABEL = { pending: 'a receber', in_grace: 'em carencia', released: 'liberado' };
function statementCsv(lines) {
    const header = ['pedido', 'pago_em', 'status_pedido', 'vendas', 'comissao', 'taxa_provedor', 'estornos', 'liquido', 'situacao'];
    const rows = lines.map((l) => [cell(l.number), l.paidAt, l.orderStatus, reais(l.gross.amount), reais(l.commission.amount), reais(l.providerFee.amount), reais(l.refunds.amount), reais(l.net.amount), PAYOUT_LABEL[l.payoutStatus]].join(';'));
    return `${BOM}${[header.join(';'), ...rows].join('\r\n')}\r\n`;
}
/**
 * Financeiro da loja (WB-075 a WB-077, RN-10, RN-13). Comissão, líquido e extrato são do DONO (`finance`); o funcionário com a
 * permissão `sales_values` vê só o total de vendas, sem comissão nem líquido. Loja de outra conta: 404 (SEC-020).
 */
let StoreFinanceController = class StoreFinanceController {
    finance;
    audit;
    constructor(finance, audit) {
        this.finance = finance;
        this.audit = audit;
    }
    sales(storeId, q) {
        return this.finance.sales(uuidParam(storeId), q.from, q.to);
    }
    /** Série diária (gráfico "Vendas por dia"); mesma permissão e definição de `sales`. */
    salesDaily(storeId, q) {
        return this.finance.salesDaily(uuidParam(storeId), q.from, q.to);
    }
    summary(storeId, q) {
        return this.finance.summary(uuidParam(storeId), q.from, q.to);
    }
    statement(storeId, q) {
        return this.finance.statement(uuidParam(storeId), q.from, q.to, q);
    }
    /** Extrato exportável (até 5.000 pedidos mais recentes do período). A exportação entra na auditoria. */
    async csv(storeId, q, ctx, res) {
        const id = uuidParam(storeId);
        const lines = await this.finance.statementAll(id, q.from, q.to);
        await this.audit.recordStandalone(ctx, { action: 'store.finance.export', targetType: 'store', targetId: id, after: { from: q.from, to: q.to, rows: lines.length } });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="extrato-${q.from}-${q.to}.csv"`);
        return statementCsv(lines);
    }
};
__decorate([
    StorePermission('sales_values'),
    Get('sales'),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(period))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], StoreFinanceController.prototype, "sales", null);
__decorate([
    StorePermission('sales_values'),
    Get('sales/daily'),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(period))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], StoreFinanceController.prototype, "salesDaily", null);
__decorate([
    StorePermission('finance'),
    Get('summary'),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(period))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], StoreFinanceController.prototype, "summary", null);
__decorate([
    StorePermission('finance'),
    Get('statement'),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(period))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], StoreFinanceController.prototype, "statement", null);
__decorate([
    StorePermission('finance'),
    RateLimit({ name: 'store-finance-export', limit: 20, windowSeconds: 3600 }),
    Get('statement.csv'),
    __param(0, Param('storeId')),
    __param(1, Query(new ZodPipe(period))),
    __param(2, Ctx()),
    __param(3, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], StoreFinanceController.prototype, "csv", null);
StoreFinanceController = __decorate([
    Controller('v1/stores/:storeId/finance'),
    __metadata("design:paramtypes", [StoreFinanceService,
        AuditService])
], StoreFinanceController);
export { StoreFinanceController };
//# sourceMappingURL=store-finance.controller.js.map