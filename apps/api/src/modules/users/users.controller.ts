import { Body, Controller, Get, Inject, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, CurrentPrincipal, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { LEGAL_DOCUMENT_TYPES } from '../admin/index.js';
import { CONSENT_PURPOSES, type ConsentPurpose } from './db/schema.js';
import { UsersService } from './users.service.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';

const setConsentSchema = z.strictObject({ granted: z.boolean() });
const acceptTermsSchema = z.strictObject({
  acceptedDocuments: z
    .array(z.strictObject({ type: z.enum(LEGAL_DOCUMENT_TYPES), version: z.number().int().positive() }))
    .min(1)
    .max(5),
});

@Controller('v1/me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    @Inject(DRIZZLE) private readonly db: Db,
  ) {}

  @Get('terms')
  async terms(@CurrentPrincipal() principal: Principal) {
    return { pending: await this.users.pendingTerms(principal.userId, principal.roles) };
  }

  @Post('terms/accept')
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Body(new ZodPipe(acceptTermsSchema)) body: z.infer<typeof acceptTermsSchema>,
  ) {
    return { pending: await this.users.acceptTerms(principal.userId, principal.roles, body.acceptedDocuments, ctx) };
  }

  @Get('consents')
  async consents(@CurrentPrincipal() principal: Principal) {
    return { consents: await this.users.consentState(principal.userId) };
  }

  @Put('consents/:purpose')
  async setConsent(
    @CurrentPrincipal() principal: Principal,
    @Ctx() ctx: RequestContext,
    @Param('purpose') purpose: string,
    @Body(new ZodPipe(setConsentSchema)) body: z.infer<typeof setConsentSchema>,
  ) {
    if (!(CONSENT_PURPOSES as readonly string[]).includes(purpose)) throw errors.notFound('Finalidade desconhecida.');
    await this.users.setConsent(this.db, principal.userId, purpose as ConsentPurpose, body.granted, 'app', ctx);
    return { consents: await this.users.consentState(principal.userId) };
  }
}
