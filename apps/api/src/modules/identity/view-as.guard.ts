import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../../platform/auth/decorators.js';
import { ViewAsService, viewAsHeaderOccurrences } from './view-as.service.js';

/**
 * Guard global DEPOIS do `AuthGuard` (threat model §14.1): cabeçalho `X-View-As` presente (inclusive vazio ou repetido) e `req.viewAs` não preenchido
 * = 403 `VIEW_AS_READ_ONLY`. Cobre o que o `AuthGuard` não olha: rota pública (ele sai cedo), de admin, de cliente e de loja sem `@StorePermission`.
 * Falha FECHADA: só passa quem o `ViewAsService.authorize` já autorizou.
 */
@Injectable()
export class ViewAsGuard implements CanActivate {
  constructor(private readonly viewAs: ViewAsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const present = req.headers['x-view-as'] !== undefined || viewAsHeaderOccurrences(req) > 0;
    if (!present || req.viewAs) return true;
    return this.viewAs.deny(req, req.principal, 'VIEW_AS_READ_ONLY');
  }
}
