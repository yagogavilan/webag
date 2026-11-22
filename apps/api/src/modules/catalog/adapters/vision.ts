import { z } from 'zod';

/**
 * IA de visão (WB-378, RN-Q10, ADR-018 "Pipeline de leitura de foto"): SÓ a porta e o adaptador `fake`. Nenhum adaptador real existe até o F8 e o J25 (custo
 * recorrente, foto enviada a terceiro: regra inviolável 6). A rota da IA é da R5 e não está no contrato da R1.
 * A SAÍDA de qualquer provedor é entrada NÃO CONFIÁVEL (C-CAD-09): `parseVisionOutput` aceita só o que o schema estrito permite e nunca aplica nada sozinha.
 */
export interface VisionInput {
  /** Só a variante recodificada (até 1.024 px, sem EXIF), nunca o original; 1 a 3 fotos. */
  photos: readonly Buffer[];
  categoryId?: string | null;
}

export interface VisionSuggestion {
  name: string;
  categoryCandidates: { categoryId: string; confidence: number }[];
  attributes: Record<string, string>;
  description: string;
}

export abstract class ProductVisionProvider {
  /** Nome do provedor (vai ao consentimento e ao log; `fake` não faz chamada externa). */
  abstract readonly provider: string;
  abstract suggest(input: VisionInput): Promise<unknown>;
}

/** Resposta fixa de demonstração, sem rede e sem ler a foto (C1). */
export class FakeProductVisionProvider extends ProductVisionProvider {
  readonly provider = 'fake';

  suggest(): Promise<unknown> {
    return Promise.resolve({ name: 'Produto de demonstração', categoryCandidates: [], attributes: { Cor: 'Preto' }, description: 'Sugestão de demonstração. Revise antes de usar.' });
  }
}

const URL_OR_HTML = /(https?:\/\/|www\.|<[a-z/!][^>]*>|javascript:|data:|\]\()/i;
const plain = (max: number) => z.string().trim().min(1).max(max).refine((value) => !URL_OR_HTML.test(value) && !/\p{Cc}/u.test(value.replace(/\n/g, '')), 'Só texto puro, sem link nem HTML.');

/**
 * Schema estrito da saída (C-CAD-09 / C11): nome até 80, categoria DENTRO da lista do catálogo, atributos de lista, descrição até 300 em texto puro, sem URL nem HTML.
 * Campo fora do schema, categoria fora da lista ou texto com link tornam a saída INTEIRA inválida (o cadastro segue manual, sem a sugestão).
 */
export function parseVisionOutput(raw: unknown, allowedCategoryIds: ReadonlySet<string>): VisionSuggestion | null {
  const schema = z.strictObject({
    name: plain(80),
    categoryCandidates: z
      .array(z.strictObject({ categoryId: z.uuid().refine((id) => allowedCategoryIds.has(id), 'Categoria fora da lista.'), confidence: z.number().min(0).max(1) }))
      .max(3),
    attributes: z.record(plain(30), plain(40)).refine((record) => Object.keys(record).length <= 6, 'Atributos demais.'),
    description: plain(300),
  });
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
