// Categoria -> objeto de produto do kit v3 (direcao-v3.md: categoria se reconhece pela imagem antes da leitura).
// O admin guarda um nome de ícone da biblioteca fixa (WB-106 C1); aqui ele vira uma das 12 peças do kit.
import { objectFor } from '../art/ProductArt';
import type { ObjectName } from '../art/objects-data';

/** Peça do kit para o nome de ícone vindo da API (e, na falta, para o nome da categoria). */
export function categoryObject(iconName: string | null | undefined, categoryName?: string): ObjectName {
  const byIcon = iconName ? objectFor(iconName) : undefined;
  if (byIcon && byIcon !== 'cesta') return byIcon;
  return objectFor(categoryName ?? iconName ?? '');
}
