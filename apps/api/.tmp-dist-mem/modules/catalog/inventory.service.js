var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { AppError } from '../../platform/http/app-error.js';
import { products, productVariants } from './db/schema.js';
/** Disponível = estoque - reservado (RN-06). Cada operação é UMA instrução atômica; nunca ler e gravar. */
let InventoryService = class InventoryService {
    /** Soma as linhas repetidas e ordena por variação: duas reservas simultâneas travam na mesma ordem (sem deadlock). */
    normalize(lines) {
        const sum = new Map();
        for (const l of lines) {
            if (!Number.isInteger(l.quantity) || l.quantity < 1)
                throw new Error('quantidade inválida');
            sum.set(l.variantId, (sum.get(l.variantId) ?? 0) + l.quantity);
        }
        return [...sum].sort(([a], [b]) => (a < b ? -1 : 1)).map(([variantId, quantity]) => ({ variantId, quantity }));
    }
    /**
     * Reserva ao criar o pedido (RN-06). `UPDATE ... WHERE estoque - reservado >= n`: a última unidade vai a quem chegar
     * primeiro; quem perde recebe 409 `STOCK_CONFLICT` e a transação inteira do pedido desfaz (nada fica reservado pela metade).
     */
    async reserve(tx, lines) {
        for (const { variantId, quantity } of this.normalize(lines)) {
            const rows = await tx
                .update(productVariants)
                .set({ reserved: sql `${productVariants.reserved} + ${quantity}`, updatedAt: new Date() })
                .where(and(eq(productVariants.id, variantId), eq(productVariants.active, true), sql `${productVariants.stock} - ${productVariants.reserved} >= ${quantity}`, sql `exists (select 1 from ${products} p where p.id = ${productVariants.productId} and p.status = 'active')`))
                .returning({ id: productVariants.id });
            if (rows.length === 0)
                throw new AppError(409, 'STOCK_CONFLICT', 'Estoque insuficiente', { detail: 'Acabou o estoque de um item da sua sacola.', extensions: { variantId } });
        }
    }
    /** Libera a reserva (pedido expirado, cancelado ou recusado antes da baixa). */
    async release(tx, lines) {
        for (const { variantId, quantity } of this.normalize(lines)) {
            const rows = await tx
                .update(productVariants)
                .set({ reserved: sql `${productVariants.reserved} - ${quantity}`, updatedAt: new Date() })
                .where(and(eq(productVariants.id, variantId), sql `${productVariants.reserved} >= ${quantity}`))
                .returning({ id: productVariants.id });
            if (rows.length === 0)
                throw new Error(`reserva inconsistente ao liberar a variação ${variantId}`);
        }
    }
    /** Baixa definitiva no pagamento aprovado: sai do estoque e da reserva de uma vez. */
    async commitSale(tx, lines) {
        for (const { variantId, quantity } of this.normalize(lines)) {
            const rows = await tx
                .update(productVariants)
                .set({ stock: sql `${productVariants.stock} - ${quantity}`, reserved: sql `${productVariants.reserved} - ${quantity}`, updatedAt: new Date() })
                .where(and(eq(productVariants.id, variantId), sql `${productVariants.reserved} >= ${quantity}`, sql `${productVariants.stock} >= ${quantity}`))
                .returning({ id: productVariants.id });
            if (rows.length === 0)
                throw new Error(`baixa inconsistente na variação ${variantId}`);
        }
    }
    /** Devolve ao estoque o que já tinha sido baixado (cancelamento depois de pago, RN-06). */
    async restock(tx, lines) {
        for (const { variantId, quantity } of this.normalize(lines)) {
            await tx
                .update(productVariants)
                .set({ stock: sql `least(${productVariants.stock} + ${quantity}, 99999)`, updatedAt: new Date() })
                .where(eq(productVariants.id, variantId));
        }
    }
};
InventoryService = __decorate([
    Injectable()
], InventoryService);
export { InventoryService };
//# sourceMappingURL=inventory.service.js.map