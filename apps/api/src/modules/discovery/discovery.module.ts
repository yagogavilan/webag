import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { MediaModule } from '../media/index.js';
import { StoresModule } from '../stores/index.js';
import { BannersController } from './banners.controller.js';
import { BannersService } from './banners.service.js';

/** Descoberta do cliente (Onda 3): banners, home, busca e favoritos. Leitura pública com cache. */
@Module({
  imports: [AdminModule, MediaModule, StoresModule],
  controllers: [BannersController],
  providers: [BannersService],
  exports: [BannersService],
})
export class DiscoveryModule {}
