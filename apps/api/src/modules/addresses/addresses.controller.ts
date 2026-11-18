import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { CurrentPrincipal, type Principal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { createAddressSchema, updateAddressSchema } from './addresses.schemas.js';
import { AddressesService, presentAddress } from './addresses.service.js';

/** `/v1/me/addresses` (WB-003, DEC-028): autenticado; o dono é sempre o `userId` do token (BOLA, SEC-020). */
@Controller('v1/me/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal) {
    const rows = await this.addresses.list(principal.userId);
    return { data: rows.map(presentAddress), nextCursor: null };
  }

  /** 201 ao criar; 200 com o existente se o mesmo endereço já estava salvo (reenvio em rede ruim não duplica). */
  @RateLimit({ name: 'address-write', limit: 60, windowSeconds: 3600 })
  @Post()
  async create(@CurrentPrincipal() principal: Principal, @Body(new ZodPipe(createAddressSchema)) body: z.infer<typeof createAddressSchema>, @Res({ passthrough: true }) res: Response) {
    const { address, created } = await this.addresses.create(principal.userId, body);
    res.status(created ? 201 : 200);
    return presentAddress(address);
  }

  @Get(':id')
  async get(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return presentAddress(await this.addresses.get(principal.userId, uuidParam(id)));
  }

  @RateLimit({ name: 'address-write', limit: 60, windowSeconds: 3600 })
  @Patch(':id')
  async update(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body(new ZodPipe(updateAddressSchema)) body: z.infer<typeof updateAddressSchema>) {
    return presentAddress(await this.addresses.update(principal.userId, uuidParam(id), body));
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    await this.addresses.remove(principal.userId, uuidParam(id));
  }
}
