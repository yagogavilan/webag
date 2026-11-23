import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, CurrentPrincipal, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { CartService } from './cart.service.js';

const contextQuery = z.strictObject({ mode: z.enum(['delivery', 'pickup']).default('delivery'), addressId: z.uuid().optional() });
const setItemSchema = z.strictObject({ quantity: z.number().int().min(1).max(999), replaceStore: z.boolean().optional() });
// R7 / C-CUP-01: o corpo só aceita `code` (letras, números e hífen, até 32). Campo a mais (`discountCents`, fonte, `campaignId`) é 422 `FIELD_NOT_EDITABLE`, nunca validação 400:
// o cliente jamais envia dinheiro, e o total é sempre o do servidor. O normalizador maiúsculo acontece no serviço.
const couponSchema = z.looseObject({ code: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9-]+$/) });
const mergeSchema = z.strictObject({
  items: z
    .array(z.strictObject({ variantId: z.uuid(), quantity: z.number().int().min(1).max(999) }))
    .max(50)
    .refine((items) => new Set(items.map((i) => i.variantId)).size === items.length, { message: 'Item repetido.' }),
});

const WRITE = { name: 'cart-write', limit: 600, windowSeconds: 3600 };

/**
 * Sacola da conta (ADR-010). Sempre do `userId` do token: não há `cartId` na URL, então não há IDOR possível.
 * Toda resposta é a sacola inteira com valores vigentes, para o app ajustar a tela com 1 requisição em 3G.
 */
@Controller('v1/cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(contextQuery)) q: z.infer<typeof contextQuery>) {
    return this.cart.get(principal, q);
  }

  @RateLimit(WRITE)
  @Delete()
  clear(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(contextQuery)) q: z.infer<typeof contextQuery>) {
    return this.cart.clear(principal, q);
  }

  @RateLimit(WRITE)
  @Put('items/:variantId')
  setItem(@CurrentPrincipal() principal: Principal, @Param('variantId') variantId: string, @Body(new ZodPipe(setItemSchema)) body: z.infer<typeof setItemSchema>, @Query(new ZodPipe(contextQuery)) q: z.infer<typeof contextQuery>) {
    return this.cart.setItem(principal, uuidParam(variantId), body, q);
  }

  @RateLimit(WRITE)
  @Delete('items/:variantId')
  removeItem(@CurrentPrincipal() principal: Principal, @Param('variantId') variantId: string, @Query(new ZodPipe(contextQuery)) q: z.infer<typeof contextQuery>) {
    return this.cart.removeItem(principal, uuidParam(variantId), q);
  }

  /** Código de cupom adivinhado por tentativa e erro: limite curto por IP além do teto global. */
  @RateLimit({ name: 'coupon-apply', limit: 30, windowSeconds: 3600 })
  @Put('coupon')
  applyCoupon(@CurrentPrincipal() principal: Principal, @Ctx() ctx: RequestContext, @Body(new ZodPipe(couponSchema)) body: z.infer<typeof couponSchema>, @Query(new ZodPipe(contextQuery)) q: z.infer<typeof contextQuery>) {
    const extra = Object.keys(body).filter((key) => key !== 'code');
    if (extra.length > 0) throw errors.unprocessable('FIELD_NOT_EDITABLE', 'Campo não editável', { errors: extra.map((field) => ({ field, message: 'Este campo não pode ser enviado: o desconto é sempre calculado pelo servidor.' })) });
    return this.cart.applyCoupon(principal, body.code, q, ctx);
  }

  @RateLimit(WRITE)
  @Delete('coupon')
  removeCoupon(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(contextQuery)) q: z.infer<typeof contextQuery>) {
    return this.cart.removeCoupon(principal, q);
  }

  @HttpCode(200)
  @RateLimit(WRITE)
  @Post('acknowledge')
  acknowledge(@CurrentPrincipal() principal: Principal, @Query(new ZodPipe(contextQuery)) q: z.infer<typeof contextQuery>) {
    return this.cart.acknowledge(principal, q);
  }

  @HttpCode(200)
  @RateLimit({ name: 'cart-merge', limit: 60, windowSeconds: 3600 })
  @Post('merge')
  merge(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(mergeSchema)) body: z.infer<typeof mergeSchema>, @Query(new ZodPipe(contextQuery)) q: z.infer<typeof contextQuery>) {
    return this.cart.merge(principal, body, q);
  }
}
