import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { CartService } from './cart.service.js';

const contextQuery = z.strictObject({ mode: z.enum(['delivery', 'pickup']).default('delivery'), addressId: z.uuid().optional() });
const setItemSchema = z.strictObject({ quantity: z.number().int().min(1).max(999), replaceStore: z.boolean().optional() });
const couponSchema = z.strictObject({ code: z.string().trim().min(1).max(30) });
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
  applyCoupon(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(couponSchema)) body: z.infer<typeof couponSchema>, @Query(new ZodPipe(contextQuery)) q: z.infer<typeof contextQuery>) {
    return this.cart.applyCoupon(principal, body.code, q);
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
