import { productionConfigProblems } from '@/server/prod-config';

/** Roda uma vez ao subir o servidor. Em produção, configuração insegura (http, localhost, host ausente) impede o boot (SEC-172). */
export function register(): void {
  if (process.env.NEXT_RUNTIME === 'edge') return;
  const problems = productionConfigProblems();
  if (problems.length > 0) throw new Error(`Configuração de produção recusada:\n- ${problems.join('\n- ')}`);
}
