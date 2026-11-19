import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DISABLED_PARAMETERS, PARAMETER_DEFINITIONS } from './parameters.definitions.js';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') && name !== 'parameters.definitions.ts' ? [readFileSync(path, 'utf8')] : [];
  });
}

/** BUG-017: parâmetro que aparece no painel precisa mudar algum comportamento; o que não muda fica em DISABLED_PARAMETERS com o motivo. */
describe('parâmetros do admin (RN-02) ligados ao código', () => {
  const code = sources(join(process.cwd(), 'src')).join('\n');

  it('toda chave definida é lida em algum ponto do código', () => {
    const unread = PARAMETER_DEFINITIONS.map((d) => d.key).filter((key) => !code.includes(`'${key}'`));
    expect(unread).toEqual([]);
  });

  it('o que está desativado na 1.0 não aparece no painel e diz por quê', () => {
    const defined = new Set(PARAMETER_DEFINITIONS.map((d) => d.key));
    for (const [key, why] of Object.entries(DISABLED_PARAMETERS)) {
      expect(defined.has(key), key).toBe(false);
      expect(code.includes(`'${key}'`), `${key} é lido no código mas está desativado`).toBe(false);
      expect(why.length).toBeGreaterThan(20);
    }
  });

  it('o piso legal de defeito durável bate com a constante do código', async () => {
    const { LEGAL_FLOOR_DAYS } = await import('../exchanges/domain/eligibility.js');
    expect(PARAMETER_DEFINITIONS.find((d) => d.key === 'troca_defeito_duravel_dias')).toMatchObject({ default: LEGAL_FLOOR_DAYS.defectDurable, min: LEGAL_FLOOR_DAYS.defectDurable, max: LEGAL_FLOOR_DAYS.defectDurable });
    expect(PARAMETER_DEFINITIONS.find((d) => d.key === 'troca_defeito_dias')).toMatchObject({ default: LEGAL_FLOOR_DAYS.defect });
  });
});
