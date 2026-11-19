# ADR-015: Geocodificador opcional e confiança no pino do endereço

- **Status:** Aceita (revisada pelo tech-lead em 2026-11-19, ver `reviews/onda-8.md`; residual aceito pelo CEO na DEC-067)
- **Data:** 2026-11-19
- **Autor:** tech-lead (registra o que backend-dev implementou para SEC-169, SEC-175/176 e DEC-059/067; complementa o ADR-008)
- **Revisores:** security-engineer (SEC-169, SEC-179), fundador (custo)
- **Custo mensal:** R$ 0 por padrão (desligado). Ligar um geocodificador com contrato é decisão de gasto do fundador (CLAUDE.md §7.6)

## Contexto
O raio, o teto do ETA e a faixa de frete saem da coordenada do endereço (ADR-013). Se o app define a coordenada, um cliente alterado pode "mentir" a posição e furar o alcance da loja. A conferência exige converter CEP em coordenada, e o provedor gratuito óbvio (Nominatim público) proíbe por política o volume de endereços de clientes.

## Decisão
| # | Decisão | Onde |
|---|---|---|
| 1 | **A coordenada do app não é confiável.** O servidor sempre valida CEP (existe), município e UF (conferem com o informado) e o raio/teto na cotação | `addresses.service.ts` `point` |
| 2 | **Geocodificador atrás de uma interface** (`GeocodingProvider`: `lookupCep`, `centerOf`, `lookup`). ViaCEP para existência e logradouro; `GEOCODER_URL` (vazio = desligado, padrão) para o centro do CEP, compatível com a busca do Nominatim; `GEOCODER_API_KEY` opcional | `stores/geocoding.ts` |
| 3 | **Ligado e no ar:** o pino é conferido contra o centro do CEP (`endereco_pino_max_m`); longe demais = 422. `pinVerified = true`. **Desligado ou fora do ar:** aceita o pino, grava `pinVerified = false` (o resíduo SEC-169, aceito na DEC-067). `centerOf` nunca lança (degradação elegante) | `geocoding.ts`, migração 0048 |
| 4 | **Só rua, cidade e UF DO CEP saem para o geocodificador**, nunca número, complemento nem dado de conta; por isso o cache por CEP (30 dias; "não achou" 1 dia; Redis) é seguro e o volume é de CEPs distintos | `HttpGeocodingProvider` |
| 5 | **Produção recusa o Nominatim público** e exige `https` em `GEOCODER_URL` (a chave vai na consulta) no boot; o provedor `fake` também é recusado em produção | `platform/config/env.ts` |
| 6 | Timeout de 4 s e recuo de 60 s quando o serviço cai (evita 4 s por endereço) | `geocoding.ts` |

## Consequências
- Positivas: o fundador não paga nada para o v1.0; trocar de provedor é configuração; o contrato com o geocodificador pode vir depois sem mexer em regra de negócio.
- Dívida assumida: sem geocodificador o alcance depende de uma coordenada que o app informa (`pinVerified = false`); o teto do ETA e a faixa de frete ainda limitam o dano a "entregar mais longe que o permitido dentro do município"; com o ViaCEP fora do ar nem o município é conferido. **DT-077:** a chave do geocodificador vai na query string (aparece em log do provedor/proxy); trocar para cabeçalho se o provedor contratado aceitar. Não testado contra rede real nesta sessão (testes com `fetch` simulado).
- Rever se: houver registro de entrega fora do alcance (usar `pinVerified = false` como filtro), ou o fundador contratar um geocodificador.
