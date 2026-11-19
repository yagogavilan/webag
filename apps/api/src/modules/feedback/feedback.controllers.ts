import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, CurrentPrincipal, Public, StorePermission, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { ContentReportsService, REMOVAL_REASONS } from './content-reports.service.js';
import { HELP_AUDIENCES, REPORT_REASONS, REPORT_TARGETS } from './db/schema.js';
import { HelpService } from './help.service.js';
import { StoreReviewsService } from './store-reviews.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idParam = (value: string): string => {
  if (!UUID.test(value)) throw errors.notFound();
  return value;
};

// ------------------------------------------------------------------- ajuda

const audienceQuery = z.strictObject({ audience: z.enum(HELP_AUDIENCES).default('customer') });
const faqCreate = z.strictObject({ audience: z.enum(HELP_AUDIENCES), group: z.string().min(2).max(20), question: z.string().trim().min(3).max(100), answer: z.string().trim().min(3).max(600), published: z.boolean().optional() });
const faqPatch = z.strictObject({ group: z.string().min(2).max(20).optional(), question: z.string().trim().min(3).max(100).optional(), answer: z.string().trim().min(3).max(600).optional(), published: z.boolean().optional() });
const faqReorder = z.strictObject({ audience: z.enum(HELP_AUDIENCES), group: z.string().min(2).max(20), ids: z.array(z.uuid()).min(1).max(100) });
const faqList = z.strictObject({ audience: z.enum(HELP_AUDIENCES).optional() });
const phone = z.string().trim().transform((v) => v.replace(/\D/g, '')).pipe(z.string().regex(/^\d{10,13}$/, 'Confira o WhatsApp com DDD.'));
const contactsSchema = z.strictObject({
  supportWhatsapp: phone.nullable().optional(),
  supportEmail: z.string().trim().toLowerCase().max(120).pipe(z.email({ message: 'Confira o e-mail.' })).nullable().optional(),
  supportHours: z.string().trim().max(60).nullable().optional(),
  privacyOfficerName: z.string().trim().max(80).nullable().optional(),
  privacyOfficerEmail: z.string().trim().toLowerCase().max(120).pipe(z.email({ message: 'Confira o e-mail.' })).nullable().optional(),
});

/** WB-034 / WB-227 C4: ajuda pública (visitante, cliente e lojista), perguntas publicadas e contatos da configuração. */
@Controller('v1/help')
export class HelpController {
  constructor(private readonly help: HelpService) {}

  @Public()
  @Get()
  @RateLimit({ name: 'help-public', limit: 120, windowSeconds: 60 })
  get(@Query(new ZodPipe(audienceQuery)) query: z.infer<typeof audienceQuery>) {
    return this.help.publicHelp(query.audience);
  }
}

/** AJ3: conteúdo da ajuda (perguntas e contatos). Operação e super admin editam; financeiro e suporte leem. */
@Controller('v1/admin/help')
export class AdminHelpController {
  constructor(private readonly help: HelpService) {}

  @AdminOnly('help:read')
  @Get('faqs')
  list(@Query(new ZodPipe(faqList)) query: z.infer<typeof faqList>) {
    return this.help.listFaqs(query.audience);
  }

  @AdminOnly('help:write')
  @Post('faqs')
  create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(faqCreate)) body: z.infer<typeof faqCreate>) {
    return this.help.createFaq(ctx, body);
  }

  @AdminOnly('help:write')
  @Post('faqs/reorder')
  @HttpCode(200)
  reorder(@Ctx() ctx: RequestContext, @Body(new ZodPipe(faqReorder)) body: z.infer<typeof faqReorder>) {
    return this.help.reorder(ctx, body);
  }

  @AdminOnly('help:write')
  @Patch('faqs/:id')
  update(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body(new ZodPipe(faqPatch)) body: z.infer<typeof faqPatch>) {
    return this.help.updateFaq(ctx, idParam(id), body);
  }

  @AdminOnly('help:write')
  @Delete('faqs/:id')
  @HttpCode(204)
  async remove(@Ctx() ctx: RequestContext, @Param('id') id: string): Promise<void> {
    await this.help.deleteFaq(ctx, idParam(id));
  }

  @AdminOnly('help:read')
  @Get('contacts')
  contacts() {
    return this.help.contacts();
  }

  @AdminOnly('help:write')
  @Put('contacts')
  putContacts(@Ctx() ctx: RequestContext, @Body(new ZodPipe(contactsSchema)) body: z.infer<typeof contactsSchema>) {
    return this.help.putContacts(ctx, body);
  }
}

// ---------------------------------------------------------------- denúncias

const reportSchema = z.strictObject({ targetType: z.enum(REPORT_TARGETS), targetId: z.uuid(), reason: z.enum(REPORT_REASONS), text: z.string().trim().max(200).optional() });
const queueQuery = z.strictObject({ targetType: z.enum(REPORT_TARGETS), status: z.enum(['open', 'handled']).optional(), cursor: z.string().max(300).optional(), limit: z.string().max(4).optional() });
const keepSchema = z.strictObject({ note: z.string().trim().min(3).max(200).optional() });
const removeSchema = z.strictObject({ reasonCode: z.enum(REMOVAL_REASONS), note: z.string().trim().max(150).optional() });
const targetParam = (type: string): (typeof REPORT_TARGETS)[number] => {
  if (!(REPORT_TARGETS as readonly string[]).includes(type)) throw errors.notFound();
  return type as (typeof REPORT_TARGETS)[number];
};

/** DN1: denunciar avaliação, produto ou loja (exigência das lojas de apps). */
@Controller('v1')
export class ContentReportsController {
  constructor(private readonly reports: ContentReportsService) {}

  /** Sempre `202 { received: true }`, também na repetição e na denúncia da própria avaliação (não revela o que já existia). */
  @Post('reports')
  @HttpCode(202)
  @RateLimit({ name: 'content-report', limit: 20, windowSeconds: 3600 })
  submit(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(reportSchema)) body: z.infer<typeof reportSchema>) {
    return this.reports.submit(principal.userId, body);
  }

  @Get('me/reports')
  mine(@CurrentPrincipal() principal: Principal) {
    return this.reports.mine(principal.userId);
  }
}

/** DN2: moderação de denúncias (operação e super admin). */
@Controller('v1/admin/content-reports')
export class AdminContentReportsController {
  constructor(private readonly reports: ContentReportsService) {}

  @AdminOnly('moderation:read')
  @Get()
  queue(@Query(new ZodPipe(queueQuery)) query: z.infer<typeof queueQuery>) {
    return this.reports.queue(query);
  }

  @AdminOnly('moderation:read')
  @Get(':targetType/:targetId')
  detail(@Param('targetType') type: string, @Param('targetId') id: string) {
    return this.reports.detail(targetParam(type), idParam(id));
  }

  @AdminOnly('moderation:write')
  @Post(':targetType/:targetId/keep')
  @HttpCode(200)
  keep(@Ctx() ctx: RequestContext, @Param('targetType') type: string, @Param('targetId') id: string, @Body(new ZodPipe(keepSchema)) body: z.infer<typeof keepSchema>) {
    return this.reports.keep(ctx, targetParam(type), idParam(id), body.note);
  }

  /** Só avaliação: ofensa, dado pessoal, ilegal ou spam. Não existe o motivo "avaliação negativa" (RN-12). */
  @AdminOnly('moderation:write')
  @Post('review/:targetId/remove')
  @HttpCode(200)
  remove(@Ctx() ctx: RequestContext, @Param('targetId') id: string, @Body(new ZodPipe(removeSchema)) body: z.infer<typeof removeSchema>) {
    return this.reports.removeReview(ctx, idParam(id), body.reasonCode, body.note);
  }

  @AdminOnly('moderation:write')
  @Post(':targetType/:targetId/forward')
  @HttpCode(200)
  forward(@Ctx() ctx: RequestContext, @Param('targetType') type: string, @Param('targetId') id: string) {
    const target = targetParam(type);
    if (target === 'review') throw errors.validation([{ field: 'targetType', message: 'Avaliação se mantém ou se remove; só produto e loja são encaminhados.' }]);
    return this.reports.forward(ctx, target, idParam(id));
  }
}

// -------------------------------------------------- avaliações no painel da loja

const reviewsQuery = z.strictObject({ replied: z.enum(['true', 'false']).transform((v) => v === 'true').optional(), rating: z.coerce.number().int().min(1).max(5).optional(), cursor: z.string().max(300).optional(), limit: z.string().max(4).optional() });
const replySchema = z.strictObject({ text: z.string().trim().min(1).max(500) });

/** Avaliações da loja e resposta pública do lojista (permissão `reviews`; funcionário sem ela: 403, outra loja: 404). */
@Controller('v1/stores/:storeId/reviews')
export class StoreReviewsController {
  constructor(private readonly reviews: StoreReviewsService) {}

  @StorePermission('reviews')
  @Get()
  list(@Param('storeId') storeId: string, @Query(new ZodPipe(reviewsQuery)) query: z.infer<typeof reviewsQuery>) {
    return this.reviews.list(idParam(storeId), query);
  }

  /** W.6: resumo (média, total, distribuição 1 a 5, sem resposta) para o Início e a página de Avaliações. */
  @StorePermission('reviews')
  @Get('summary')
  summary(@Param('storeId') storeId: string) {
    return this.reviews.summary(idParam(storeId));
  }

  @StorePermission('reviews')
  @Put(':reviewId/reply')
  @RateLimit({ name: 'review-reply', limit: 60, windowSeconds: 3600 })
  reply(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Param('reviewId') reviewId: string, @Body(new ZodPipe(replySchema)) body: z.infer<typeof replySchema>) {
    return this.reviews.reply(idParam(storeId), idParam(reviewId), principal.userId, body.text);
  }

  @StorePermission('reviews')
  @Delete(':reviewId/reply')
  @HttpCode(204)
  async removeReply(@CurrentPrincipal() principal: Principal, @Param('storeId') storeId: string, @Param('reviewId') reviewId: string): Promise<void> {
    await this.reviews.removeReply(idParam(storeId), idParam(reviewId), principal.userId);
  }
}
