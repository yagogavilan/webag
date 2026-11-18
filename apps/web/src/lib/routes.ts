import type { Route } from 'next';

/** Rotas com segmento dinâmico montado em tempo de execução (typedRoutes não infere template strings). */
export function asRoute(path: string): Route {
  return path as Route;
}
