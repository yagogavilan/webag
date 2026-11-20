# ADR-008: Geolocalização, área de entrega e busca por proximidade

- **Status:** Aceita
- **Data:** 2026-11-18
- **Autor:** tech-lead
- **Revisores:** backend-dev, mobile-dev, product-owner (regra de frete)

Legenda de fontes: ver ADR-001.

## Contexto
Brief §3: endereço por localização do aparelho ou CEP; **só mostrar lojas que entregam no endereço**; "lojas perto de mim"; filtro por distância; raio de entrega e taxa fixa ou por distância por loja; cidades e bairros cadastráveis no admin (DEC-009). Região periférica: endereço irregular, CEP genérico por cidade em alguns pontos, mapas com cobertura fraca `[HIPÓTESE — validar com testes de campo]`. Restrição: sem gasto.

## Opções consideradas
### Modelo da área de entrega
| Opção | Prós | Contras |
|---|---|---|
| `ST_DWithin(loja.location, ponto, loja.raio)` | Simples | Com raio vindo de coluna o GiST não consegue expandir a busca por constante; vira varredura `[N — doc ST_DWithin]` |
| **`delivery_area geography(Polygon)` gerado de `ST_Buffer(location, raio)` + GiST, consulta com `ST_Covers`** | Usa índice; aceita polígono desenhado na fase 2 sem mudar consulta | Recalcular ao mudar raio/endereço (trigger ou service) |
| Lista de bairros atendidos | Fácil de explicar ao lojista | Bairro sem polígono oficial nessas cidades; impreciso |

### Coordenadas a partir de endereço/CEP
| Opção | Prós | Contras |
|---|---|---|
| **No app: `expo-location` (`geocodeAsync`/GPS) + pino ajustável no mapa** | Gratuito (geocoder do sistema); usuário corrige o pino | Qualidade varia por aparelho |
| ViaCEP / BrasilAPI | Gratuitos, CEP → logradouro | ViaCEP não traz coordenada; BrasilAPI v2 só às vezes |
| Nominatim público | Gratuito, coordenada | Política de uso: ≤ 1 req/s, sem uso massivo, atribuição obrigatória |
| Google Geocoding | Melhor qualidade | Pago acima da cota; exige conta do fundador |

## Decisão
1. **Tipos:** `geography(Point, 4326)` em `stores.location` e `addresses.location`; `stores.delivery_area geography(Polygon, 4326)`; índice GiST em ambos. Distâncias em metros.
2. **"Entrega no meu endereço":** `ST_Covers(s.delivery_area, :ponto)` + loja aprovada/ativa + cidade liberada. **"Perto de mim":** `ST_DWithin(s.location, :ponto, :raioMaxBusca)` com raio constante (usa índice) e ordenação por `s.location <-> :ponto` (KNN). Distância exibida: `ST_Distance` arredondada.
3. **Frete:** fixo ou por faixas de distância em linha reta `[HIPÓTESE — distância por rota exige serviço de rotas (OSRM próprio ou pago); reavaliar com dados reais]`. Cálculo no servidor, na cotação.
4. **Endereço do cliente:** GPS ou CEP (ViaCEP para logradouro) → coordenada pelo geocoder do aparelho → **usuário confirma/ajusta o pino** antes de salvar. Sem coordenada confirmada não há cotação de entrega (só retirada).
5. **Endereço da loja (painel web):** CEP via ViaCEP + Nominatim atrás de `GeocodingProvider` com cache e fila de 1 req/s + ajuste manual do pino. Google entra como adaptador se o fundador quiser pagar.
6. **Regiões:** `cities` (código IBGE, nome, liberada) e `neighborhoods` (nome, cidade) administráveis; polígono opcional na fase 2.
7. **Busca textual** (mesmo módulo `search`): Postgres FTS (`portuguese` + `unaccent`) e `pg_trgm` para erros de digitação, combinada com os filtros geográficos. Sem Elasticsearch na 1.0.
8. **Mapas:** `react-native-maps` (Google no Android exige chave gratuita do Maps SDK — fundador; Apple Maps no iOS). No web, MapLibre com tiles gratuitos respeitando a política de uso.
9. **Drizzle:** colunas `geography` via `customType` (o tipo nativo cobre `geometry`); consultas geo em `sql` tipado no repositório de `search`/`stores`.

## Consequências
- Positivas: busca "entrega aqui" indexada; sem custo de geocodificação; pino ajustável resolve endereço irregular.
- Negativas / dívida: frete por linha reta subestima rotas com morro/rodovia (DT-007); Nominatim público não aguenta volume — ok para cadastro de loja, não para cliente.
- Reavaliar se: reclamação de frete/raio, expansão para muitas cidades, ou app do entregador (fase 2) exigir rota real.

## Adendo 2026-11-19 (SEC-169): geocodificador configurável, nunca o Nominatim público
- **Decisão:** a API NÃO usa mais o Nominatim público (nem para o cadastro de loja). `GEOCODER_URL` (compatível com a busca do Nominatim, https) liga um geocodificador próprio ou com contrato; **vazio = desligado (padrão)**. O boot de produção recusa `openstreetmap.org`. O ViaCEP (existência, rua, bairro, cidade, UF) continua e todo resultado é cacheado por CEP em Redis (30 dias; "não achou" 1 dia); provedor fora do ar não é cacheado e recua 1 min.
- **Validação do endereço do cliente (`addresses.service.ts`):** CEP inexistente = 422 `ADDRESS_CEP_NOT_FOUND`; município/UF diferentes = 422 `ADDRESS_CEP_CITY_MISMATCH`; com geocodificador no ar o ponto é conferido contra o centro do CEP (`endereco_pino_max_m`) e o endereço fica `pinVerified=true`; **sem** geocodificador (ou ViaCEP fora) o ponto do app é aceito, só município/UF e o raio/teto de entrega da loja (na cotação) valem, e o endereço fica `pinVerified=false` (campo exposto na API e no snapshot do pedido, para a Logística).
- **Só vai ao geocodificador** rua, cidade e UF do CEP (sem número, complemento nem dado de conta): o dado é do CEP, não do cliente.
- **Custo:** desligado = R$ 0 (menos proteção contra pino falso dentro da cidade atendida). Ligar: Nominatim próprio exige uma VM com ~2 GB de RAM para o recorte do Sudeste [HIPÓTESE, estimar antes de decidir]; provedores com contrato têm cota gratuita e plano pago [confirmar preços no momento da contratação]. Decisão e credencial: fundador.
- **Dívida:** o raio de entrega com `pinVerified=false` não usa o centro da cidade (as cidades não têm coordenada cadastrada); o pino pode ser deslocado dentro do município atendido. Pagar com o geocodificador ligado antes de escalar o piloto.

## Fontes
- [V] Docker Hub 2026-11-18: `postgis/postgis:18-3.6-alpine` (só amd64) e `imresamu/postgis:18-3.6-alpine` (amd64+arm64, mantido por mantenedor do docker-postgis); npm: `drizzle-orm` 0.45.4 (`geometry`), `expo-location` ~58.0.22, `react-native-maps` 1.29.11.
- [N] https://postgis.net/docs/ST_DWithin.html ; https://postgis.net/docs/ST_Covers.html ; https://postgis.net/workshops/postgis-intro/knn.html ; https://postgis.net/docs/using_postgis_dbmanagement.html#PostGIS_Geography
- [N] https://viacep.com.br ; https://brasilapi.com.br/docs ; https://operations.osmfoundation.org/policies/nominatim/ ; https://docs.expo.dev/versions/latest/sdk/location/ ; https://developers.google.com/maps/billing-and-pricing/pricing
