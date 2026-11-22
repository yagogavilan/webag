import { RequestMethod } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { STORE_PERMISSION, VIEW_AS } from '../../platform/auth/decorators.js';

export interface ViewAsHandler {
  operationId: string;
  controller: string;
  handler: string;
  method: number | undefined;
  hasStorePermission: boolean;
}

/** Todo handler com `@ViewAs` (para o teste de VA-23 e para a verificação de boot). */
export function listViewAsHandlers(modules: ModulesContainer): ViewAsHandler[] {
  const discovery = new DiscoveryService(modules);
  const scanner = new MetadataScanner();
  const reflector = new Reflector();
  const found: ViewAsHandler[] = [];
  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as object | null;
    const metatype = wrapper.metatype;
    if (!instance || !metatype) continue;
    const proto = Object.getPrototypeOf(instance) as Record<string, () => unknown>;
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = proto[name];
      if (!handler) continue;
      const operationId = reflector.get<string | undefined>(VIEW_AS, handler);
      if (!operationId) continue;
      found.push({
        operationId,
        controller: metatype.name,
        handler: name,
        method: Reflect.getMetadata('method', handler) as number | undefined,
        hasStorePermission: reflector.getAllAndOverride<string | undefined>(STORE_PERMISSION, [handler, metatype]) !== undefined,
      });
    }
  }
  return found;
}

/** `@ViewAs` exige `@Get` e `@StorePermission` no mesmo handler; senão a API NÃO sobe (rota sem checagem de loja seria um IDOR; §14.4). */
export function invalidViewAsHandlers(handlers: ViewAsHandler[]): string[] {
  return handlers.filter((h) => h.method !== RequestMethod.GET || !h.hasStorePermission).map((h) => `${h.controller}.${h.handler} (${h.operationId})`);
}

@Injectable()
export class ViewAsBootCheck implements OnApplicationBootstrap {
  constructor(private readonly modules: ModulesContainer) {}

  onApplicationBootstrap(): void {
    const handlers = listViewAsHandlers(this.modules);
    const invalid = invalidViewAsHandlers(handlers);
    if (invalid.length > 0) throw new Error(`@ViewAs exige @Get e @StorePermission no mesmo handler: ${invalid.join(', ')}`);
  }
}
