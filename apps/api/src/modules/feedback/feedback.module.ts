import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { ContentReportsService } from './content-reports.service.js';
import { AdminContentReportsController, AdminHelpController, ContentReportsController, HelpController, StoreReviewsController } from './feedback.controllers.js';
import { HelpService } from './help.service.js';
import { StoreReviewsService } from './store-reviews.service.js';

/** O6.5: ajuda (FAQ e contatos), denúncia e moderação de conteúdo, resposta do lojista às avaliações. */
@Module({
  imports: [AdminModule],
  controllers: [HelpController, AdminHelpController, ContentReportsController, AdminContentReportsController, StoreReviewsController],
  providers: [HelpService, ContentReportsService, StoreReviewsService],
  exports: [HelpService],
})
export class FeedbackModule {}
