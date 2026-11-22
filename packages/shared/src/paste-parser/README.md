# Leitor do texto colado (cadastro rápido)

Função pura e síncrona (`parsePastedText`) que transforma a lista colada do WhatsApp em rascunhos revisáveis.
Roda no aparelho: o texto bruto nunca vai ao servidor (ADR-018 D3). Sem rede, sem `eval`, sem dependência.
Contexto: PRD `docs/produto/prd/v1-1-cadastro-rapido.md` (RN-Q8, WB-376), tela `docs/design/telas/v1-1-importar-colar.md`.

```ts
import { parsePastedText, suggestGroups } from '@webag/shared';

const { drafts, totalLines, overLimit } = parsePastedText(texto, { footwearCategory: false });
const grupos = suggestGroups(drafts); // sugestão "Juntar N linhas" (nunca automática)
```

## Formato aceito (uma linha = um produto, ordem livre)

| Campo | Formas lidas | Observação |
|---|---|---|
| Preço | `79,90` `79.90` `R$ 79,90` `R$79,90` `79,9` `1.299,90` `1299,90` `79 reais` `preço: 79,90` | Centavos inteiros, sem ponto flutuante. Válido: R$ 0,01 a R$ 99.999,99 |
| Quantidade | `4 un` `4un` `x4` `x 4` `4 peças` `4 pares` `4 em estoque` `qtd: 4` `estoque 4` | Ausente = 1 (`assumed: true`). Válido: 0 a 99.999 |
| Tamanho | `P M G GG XG XGG G1`, `tam P M G`, `P/M/G`, `P-M-G`, `PMG`, `tamanho único`, `tam 38` | Maiúsculo = alta confiança; minúsculo solto = média |
| Cor | `cor azul marinho`, `cores: preto e branco` (explícita, sai do nome); `preta`, `preto/branco` (implícita, fica no nome) | Só sugestão; cor implícita não pede confirmação |
| Nome | o que sobra | Até 80 caracteres |

Tolerado: emoji, `*negrito*`, `_itálico_`, marcadores (`-`, `•`, `1.`, `2)`), tabs, espaço não separável, caracteres invisíveis,
quebras `\r\n`, `\r` e `\n`, e o prefixo de mensagem copiada do WhatsApp (`[10:32, 22/11/2025] Maria: ...`).
Linhas vazias ou só com símbolo são ignoradas.

## Regras que valem a pena saber

- **Medida não é preço nem estoque:** `45 cm`, `1,50 m`, `5L`, `110V`, `2,00 x 3,00` ficam no nome.
- **"7 peças" / "3 pares" antes do preço é composição de kit** (fica no nome); depois do preço, ou sem preço na linha, é estoque.
- **Inteiro solto** (`Camiseta 49`) vira preço com confiança baixa e `check_field`; depois de um preço claro vira estoque com confiança baixa.
  Dois inteiros soltos sem preço claro não são adivinhados.
- **Tamanho numérico** (33 a 48) só é lido com `footwearCategory` ou com tênis, sandália, bota, chinelo ou sapato no nome, e sempre pede
  conferência (`numeric_size`). Com marcador explícito (`tam 38`, `nº 38`) lê de 1 a 60, também pedindo conferência.
- **Mais de um preço** (`P 49,90 G 59,90`): preço nulo, `multiple_prices` com `splitLines` (as linhas de "Separar em 2 linhas").
- Mais de um tamanho (`multiple_sizes`) ou mais de uma quantidade (`multiple_quantities`) também não são resolvidos sozinhos.

## Saída

`PasteDraft` por linha: `name`, `baseName` (nome sem cor; com a cor, é a chave do agrupamento: `suggestGroups` só junta linhas da MESMA cor, DEC-128), `sizes`, `colors`, `priceCents`, `quantity`, cada um com
`value`, `confidence` (`high` | `medium` | `low` | `none`) e `assumed`; mais `issues[]` e `status`:

| `status` | Quando | O app |
|---|---|---|
| `ready` | nome e preço lidos sem dúvida | mostra "Pronta" (ainda falta a foto) |
| `confirm` | há `issues` de severidade `confirm` | pede confirmação no campo marcado |
| `incomplete` | `missing_name`, `missing_price`, `invalid_price` ou `invalid_quantity` | "Falta o preço", fora do "Publicar os válidos" |

Limites: 100 linhas com conteúdo por colagem (`overLimit` + `totalLines` para "Cole até 100 linhas por vez"; `drafts` traz as 100 primeiras
= "Usar as 100 primeiras") e 200 caracteres por linha (o resto é cortado, `line_truncated`: o item nunca é `ready` e o preço lido ganha
`check_field` com `reason: 'line_truncated'` e confiança `low`, porque "R$ 1.299,90" cortado vira R$ 1,00; DEC-128 #3).

## Segurança (C-CAD-04)

- O texto nunca é interpretado: nome com `=HYPERLINK(...)`, `<script>`, `@`, `+` fica literal. **O escape de CSV/HTML não é daqui:** é da
  exportação e do servidor, que sanitiza de novo.
- Caracteres de controle, invisíveis (zero-width) e de direção de texto (bidi) são removidos.
- Sem ReDoS: cada linha é cortada antes de qualquer regex (2.000 caracteres, depois 200), as regex são ancoradas e de largura fixa, e só as
  100 primeiras linhas são analisadas. Há teste com 100 KB de entrada patológica.

## Limitações conhecidas

Cor implícita e tamanho infantil ("2 anos") não são lidos; `79,90 m` (preço seguido de `m` minúsculo) é tratado como medida; lista de cores,
unidades e prefixos do WhatsApp foi montada pelo time [HIPÓTESE] e deve ser ajustada com listas reais de lojistas.
