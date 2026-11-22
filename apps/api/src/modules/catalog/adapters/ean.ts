/**
 * Consulta de EAN em base EXTERNA (WB-373 C7/C9, RN-Q7): desligada por padrão (flag `ean_base_externa`, F9: termos e licença ODbL/Cosmos não verificados) e
 * NENHUM adaptador externo é escrito. Com a flag desligada nenhuma chamada de rede sai (`lookupExternalEan` nem chama o provedor). A rota de EAN é da R2.
 */
export interface ExternalEanHit {
  name: string;
  brand: string | null;
}

export abstract class ExternalEanLookup {
  abstract lookup(gtin: string): Promise<ExternalEanHit | null>;
}

/** Único adaptador existente: não faz nada, nem rede (o F9 troca por um real, com ADR e autorização do fundador). */
export class DisabledExternalEanLookup extends ExternalEanLookup {
  lookup(): Promise<ExternalEanHit | null> {
    return Promise.resolve(null);
  }
}

/** Porta única para consultar a base externa: flag desligada = `null` sem tocar no provedor. */
export async function lookupExternalEan(provider: ExternalEanLookup, flagEnabled: boolean, gtin: string): Promise<ExternalEanHit | null> {
  if (!flagEnabled) return null;
  return provider.lookup(gtin);
}
