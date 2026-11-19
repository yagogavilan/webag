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
import { Inject, Injectable, Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { AdminModule } from '../admin/index.js';
import { IdentityModule } from '../identity/index.js';
import { MediaModule } from '../media/index.js';
import { StoresModule } from '../stores/index.js';
import { AdminModerationController, CatalogController } from './catalog.controllers.js';
import { CatalogService, ProductOrdersPort } from './catalog.service.js';
import { InventoryService } from './inventory.service.js';
import { ModerationService } from './moderation.service.js';
/**
 * Pedido em andamento de um produto (WB-060 C5). Leitura direta e só de leitura nas tabelas do pedido, para o catálogo não
 * depender do módulo de pedidos (que depende dele pela reserva de estoque): exceção registrada no ADR-007.
 */
let SqlOpenOrders = class SqlOpenOrders extends ProductOrdersPort {
    db;
    constructor(db) {
        super();
        this.db = db;
    }
    async hasOpenOrders(productId) {
        const result = await this.db.execute(sql `
      select 1 from order_items oi join orders o on o.id = oi.order_id
      where oi.product_id = ${productId}
        and o.status in ('awaiting_payment', 'received', 'accepted', 'in_preparation', 'out_for_delivery', 'ready_for_pickup')
      limit 1`);
        return result.rows.length > 0;
    }
};
SqlOpenOrders = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object])
], SqlOpenOrders);
let CatalogModule = class CatalogModule {
};
CatalogModule = __decorate([
    Module({
        imports: [AdminModule, IdentityModule, MediaModule, StoresModule],
        controllers: [CatalogController, AdminModerationController],
        providers: [CatalogService, InventoryService, ModerationService, { provide: ProductOrdersPort, useClass: SqlOpenOrders }],
        exports: [CatalogService, InventoryService, ModerationService, ProductOrdersPort],
    })
], CatalogModule);
export { CatalogModule };
//# sourceMappingURL=catalog.module.js.map