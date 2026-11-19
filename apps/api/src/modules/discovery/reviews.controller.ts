import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { ReviewsService } from './reviews.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderIdParam = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound('Pedido não encontrado.');
  return value;
};
const createSchema = z.strictObject({
  productId: z.uuid().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
  fit: z.enum(['small', 'ok', 'large']).optional(),
});

/** Avaliações do cliente sobre um pedido entregue. Pedido de outra conta: 404. */
@Controller('v1/orders/:orderId/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @RateLimit({ name: 'review-create', limit: 60, windowSeconds: 3600 })
  @Post()
  create(@CurrentPrincipal() p: Principal, @Param('orderId') orderId: string, @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.reviews.create(p.userId, orderIdParam(orderId), body);
  }

  @Get()
  list(@CurrentPrincipal() p: Principal, @Param('orderId') orderId: string) {
    return this.reviews.listForOrder(p.userId, orderIdParam(orderId));
  }
}
