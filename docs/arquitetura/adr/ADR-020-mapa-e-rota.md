# ADR-020: Mapa, rota, ETA e rastreio ao vivo (R3 e R4 da v1.1)

- **Status:** **Proposta** (nada contratado, cadastrado nem gasto; a decisão de dinheiro e de conta é do fundador, §11)
- **Data:** 2026-11-23
- **Autor:** tech-lead
- **Revisores:** security-engineer (§7 LGPD, CSP, C-MOT-13, C-RT-05), backend-dev (`RoutePlanner`, retenção de pontos), mobile-dev (MapLibre nativo, spike), qa-engineer (teste de rede, 3G), fundador (§11)
- **Relação:** confirma, com evidência e plano B, a DEC-102 F11 ("Protomaps + heurística + Maps/Waze, sem fatura nova"). Se aceita, **substitui só o item 8 do ADR-008** (`react-native-maps`/Google no app); o resto do ADR-008 (PostGIS, raio, frete) segue. Insumos: `plano-v1-1.md` §R3 e L5; PRDs `v1-1-despacho-e-app-motoboy.md` (RN-D2, WB-380 a 382) e `v1-1-rastreio-e-notificacoes.md` (RN-R1 a R7, WB-392 a 395); specs `design/telas/v1-1-admin-despacho.md`, `v1-1-rastreio-cliente.md`, `v1-1-app-motoboy.md`; `seguranca/threat-model-v1-1.md` (C-MOT-11 a 14, C-RT-01 a 08, SEC-193/196/198); ADR-004, ADR-005, ADR-015, ADR-017; `produto/v1-1-pesquisa.md` §6 e §7.

## Legenda de fontes e limite honesto da pesquisa
| Marca | Significa |
|---|---|
| **[V]** | Verificado nesta sessão em 2026-11-23: registro npm e Maven Central (versão, licença, peer deps) e inspeção do binário `libmaplibre.so` 13.6.1 |
| **[PESQ]** | `produto/v1-1-pesquisa.md` §6 e §7 (2026-11-22, com a fonte lá citada; cotas conflitantes entre páginas foram mantidas como conflito) |
| **[CG]** | Conhecimento geral do tech-lead (corte jun/2026), **não verificado hoje**: o proxy da sessão bloqueou (403) `developers.google.com`, `cloud.google.com`, `mapbox.com`, `operations.osmfoundation.org`, `docs.protomaps.com`, `maplibre.org`, e a sessão não tem WebSearch/WebFetch |
| **[HIPÓTESE]** | Premissa ou estimativa sem medição; o spike da §9 a troca por [V] ou a derruba |

**Todo preço e todo termo de uso de Google e Mapbox abaixo é [CG] ou [PESQ] e deve ser reconferido nas páginas oficiais, com data, antes de o fundador contratar qualquer coisa.** Câmbio: US$ 1 = R$ 5,50 (`deploy/guia-deploy.md` §2).

## 1. Contexto e requisitos
Forças reais: 1 dev por camada, 1 VPS, custo adicional alvo R$ 0 (PRD despacho), LGPD do GPS do motoboy (J26 pendente), 1 a 2 motoboys por rota, 10 mil usuários e ~1 mil simultâneos no pico do app. Os simultâneos **não** são viewers de mapa: com 1 a 2 motoboys há no máximo ~8 entregas em andamento (2 x lote de 4), então no máximo ~8 clientes com mapa aberto por rastreio.

| # | Requisito | Origem |
|---|---|---|
| Q1 | Mapa no **admin web**: fila, lojas, destinos, motoboys **em corrida** (sem pino de "Disponível", RN-D12), atribuição pelo mapa ou pela lista; **sem mapa a lista funciona** | WB-380 C1 a C5 |
| Q2 | Mapa no **app do motoboy** (Android): rota sugerida, paradas, "Navegar" abre Waze/Maps | WB-384, 386 |
| Q3 | **Rota ordenada** para 2 a 8 paradas (exata até 8), horário previsto por parada, aviso de atraso; **sem chamada a serviço externo** (teste de rede) | RN-D2, WB-381 C2 e C8 |
| Q4 | **ETA** informativo ("por volta de HH:MM"), faixa prometida não muda | RN-R5, WB-393 |
| Q5 | **Rastreio do cliente**: só marcador do motoboy + destino, 1 posição por 5 s, 4 casas decimais, só na próxima parada, texto equivalente | RN-R1/R2, C-RT-02/05, WB-392 |
| Q6 | **3G**: primeira pintura do mapa e do texto do ETA aceitáveis; sem mapa, a tela diz distância e ETA em texto | WB-392 C7, spec cliente |
| Q7 | Links Maps/Waze **só com coordenadas ou endereço da parada**, sem nome nem telefone | C-MOT-13, WB-382 C6 |
| Q8 | Nenhuma requisição aos servidores da fundação OSM nem a terceiros de estilo (fonte, sprite) | WB-380 C4 |
| Q9 | Atribuição "© OpenStreetMap" visível; tela "Licenças" no app do motoboy | PRD despacho, RNF Licença |

## 2. Opções comparadas
Colunas pelos critérios do Webag: custo, LGPD/dado, reversibilidade, curva para 1 dev, encaixe na stack.

| Opção | Mapa (render + tiles) | Rota/ETA | Prós | Contras |
|---|---|---|---|---|
| **A. MapLibre + Protomaps (PMTiles) próprio, rota heurística** (DEC-102 F11) | MapLibre GL JS 6.19.0 (BSD-3) na web e `@maplibre/maplibre-react-native` 11.5.1 (MIT) nos apps, **[V]**; tiles = 1 arquivo `.pmtiles` de extrato regional servido por nós | Heurística RN-D2/RN-19, no servidor | R$ 0 recorrente; nenhum terceiro vê posição nem IP; sem cartão; arquivo único (sem servidor de mapas); funciona atrás do nginx já existente | Operação nossa (atualizar extrato); módulo nativo exige build de desenvolvimento (não roda no Expo Go); qualidade do OSM na periferia `[HIPÓTESE]`; ETA em linha reta erra onde a rua dá volta |
| **B. A + roteamento próprio (OSRM ou Valhalla) com recorte da Grande SP** | idem A | OSRM (BSD-2) ou Valhalla (MIT) em contêiner; distância/tempo reais por rua, sem trânsito | Rota por rua sem fatura; ilimitado | Mais um serviço (RAM, atualização do extrato, monitoramento); **sem trânsito**; só se paga com o gatilho do PRD |
| **C. Google Maps Platform** (Maps SDK/JS, Routes, Geocoding) | `react-native-maps` + Maps JS | Routes API | Melhor dado e **trânsito** no Brasil `[CG]`; SDK nativo pronto; roda no Expo Go (react-native-maps) | **Conta com faturamento e cartão** (CLAUDE.md §7.6); coordenadas e IP a terceiro nos EUA (LGPD art. 33, Data Safety); termos proíbem usar o conteúdo com mapa que não seja Google `[CG]`; cota/preço mudam (cotas por SKU a partir de 2025 `[CG]`); chave de API exposta no app |
| **D. Mapbox** (GL + Directions) | SDK proprietário desde a v10 `[CG]` | Directions/Optimization | Boa ferramenta, cota grátis larga `[CG]` | Conta e token; telemetria do SDK `[CG]`; licença proprietária; cota **conflita**: 10 mil/mês por API sem cartão [PESQ] x 100 mil `[CG]` |
| **E. MapLibre + tiles de terceiro pago** (MapTiler, Stadia, Protomaps hospedado) | MapLibre + URL do provedor | Heurística | Sem operar extrato; mesmo renderizador (troca barata) | Plano grátis **não comercial** [PESQ]; produção ~US$ 2.500/ano [PESQ, não confirmado] ou ~US$ 25/mês `[CG]`; terceiro vê IP e área; fatura nova |
| **F. tile.openstreetmap.org** | MapLibre + tiles da fundação OSM | n/a | R$ 0 | Política da OSMF: **não recomendado em produção**, pode bloquear sem aviso, proíbe baixar área para offline [PESQ]; viola Q8. **Descartada** |
| **G. Nada de mapa nativo; só links Maps/Waze + lista** | n/a | n/a | Custo e risco zero | Não entrega o que o fundador pediu (rastreio no mapa, mapa no admin). Fica como **degradação**, não como destino |

Geocodificação, por opção:
| Opção | Observação |
|---|---|
| **Nada novo (ADR-015)** | ViaCEP + `GEOCODER_URL` opcional + pino do endereço; o destino do mapa **é** o pino já confirmado (WB-380 C5); sem ponto, "sem posição" e fora do cálculo |
| Nominatim público | Já recusado em produção (ADR-015 §5); política proíbe volume |
| Nominatim/Photon próprio | Importar o Brasil custa dezenas de GB de disco e RAM `[HIPÓTESE]`; **descartado** para o porte do projeto |
| Google Geocoding / Mapbox | Pago por chamada; armazenar o resultado tem regra própria (Mapbox "permanente", Google cache limitado) `[CG]`; só com autorização e se "sem ponto" passar de 5% (gatilho RN-D12) |

## 3. Custo mensal estimado
Premissas **[HIPÓTESE]**: 25% dos usuários pedem no mês, 2 pedidos cada; 70% são entrega; 80% das entregas têm rastreio (motoboy com app); 3 aberturas de mapa por entrega rastreada; 20 min de rastreio; admin: 22 dias x 30 aberturas por operador. 10 mil usuários resultam em ~3.500 entregas/mês (~14 por hora em 10 h x 26 dias), **perto do gatilho de 15 por hora do PRD** (despacho automático e motor de rota próprio).

| | A: 1 mil usuários | B: 10 mil usuários |
|---|---|---|
| Entregas/mês; com rastreio | 350; 280 | 3.500; 2.800 |
| Aberturas de mapa/mês (cliente + admin + motoboy) | ~1.650 | ~10.200 |
| Rotas se houvesse provedor, **"rota uma vez"** (1 por lote + 1 re-rota por entrega rastreada) | ~510 | ~5.100 |
| Rotas se houvesse provedor, **ETA ingênuo** (2 chamadas/min por entrega rastreada, 20 min) | ~11.200 | ~112.000 |

| Opção | A (R$/mês) | B, "rota uma vez" | B, ETA ingênuo | Fonte |
|---|---|---|---|---|
| **A. Protomaps próprio + heurística** | **0** | **0** | n/a (ETA local, sem chamada) | Disco ~1 GB, banda ~1 a 6 GB/mês `[HIPÓTESE]` dentro do VPS já previsto |
| B. + OSRM/Valhalla recorte | 0 | 0 a ~100 (RAM extra, se o VPS de 4 GB não bastar) | idem | `[HIPÓTESE]`, §8; mais horas de operação |
| C. Google (mapas: SDK nativo sem cobrança e Maps JS dentro da cota grátis do admin; Routes: 10 mil grátis, depois ~US$ 5 por mil, ~US$ 10 com trânsito) | 0 | 0 (5.100 < 10 mil grátis) | **~2.800** (sem trânsito) a **~5.900** (com trânsito) | `[CG]`, não verificado; [PESQ] §7 aponta "snapshots conflitantes" |
| D. Mapbox (Directions) | 0 | 0 | **~130** (se 100 mil grátis `[CG]`) a **~1.100** (se 10 mil grátis [PESQ]) | Conflito de cotas entre as duas fontes |
| E. Tiles de terceiro pago | ~0 a 140 (plano mínimo) | ~140 a ~1.150 | idem | [PESQ] e `[CG]` divergem |
| F. OSMF | 0 | 0 | 0 | Proibido para o caso (§2) |

Leituras que importam:
1. **Em 1 mil e em 10 mil usuários o dinheiro não decide o mapa**: Google e Mapbox ficam dentro das cotas grátis se o ETA não chamar o provedor a cada ponto. O que decide é **conta com cartão, terceiro vendo coordenadas e IP, Data Safety, termo de uso e lock-in** (§6, §7).
2. **Regra de desenho que vale para qualquer opção:** a rota (geometria e tempo) é calculada **uma vez por trecho**; o ETA ao vivo é a distância restante **projetada** sobre o trecho no servidor (RN-R5), nunca uma chamada por ponto de GPS. Isso corta o custo ingênuo em ~20x e é o que mantém o plano B barato.
3. Tiles próprios custam trabalho, não fatura: ~1 dia de spike, ~0,5 h por atualização do extrato `[HIPÓTESE]`.

## 4. Decisão (proposta)
1. **Mapa:** opção **A**. MapLibre (GL JS na web, Native nos apps), tiles Protomaps em um `.pmtiles` de extrato regional servido por **nginx estático em host próprio** (`mapa.<domínio>`), estilo mínimo (sem POI e sem 3D), **fontes (glyphs) e sprites também auto-hospedados**, atribuição OSM sempre visível. Não existe conta, chave nem fatura.
2. **Rota e ETA:** heurística do PRD (RN-D2, RN-19, RN-R5) **atrás de uma interface `RoutePlanner` no módulo de logística** (mesmo padrão do `GeocodingProvider`, ADR-015 e `PaymentProvider`), com **uma única implementação (`heuristic`)** na R3. Sem OSRM/Valhalla, sem provedor pago. Trocar a implementação deve mexer em **um** diretório.
3. **Geocodificação:** nada novo; vale o ADR-015.
4. **Links Maps/Waze:** só coordenadas da parada, gerados por função única com teste (C-MOT-13). URLs de Maps e Waze não pedem chave `[CG]` e não entram na conta.
5. **Linha da rota no mapa:** sem geometria de rua não se desenha rota como se fosse rua. Desenhar **segmentos retos tracejados** rotulados "estimado em linha reta" (o admin já mostra a conta, spec §0.4); no cliente, **sem linha**, só marcador e destino. Pedido ao designer.
6. **Faseamento:** R3 só precisa do mapa **web** do admin; o **mapa nativo** só é necessário na R4 (app do motoboy e rastreio do cliente), que já está atrás de J8/J26 e SEC-193/198. Se o nativo reprovar no spike, a R3 não atrasa.
7. **Condição:** a decisão só vira **Aceita** depois do spike L5 (§9) passar nos critérios dele; senão vale o plano B (§10).

Motivo do critério que pesou: custo zero **sem** abrir mão de privacidade do motoboy e do cliente (nenhum terceiro recebe posição, IP ou área vista) e **sem conta com cartão** antes de existir piloto. A superfície é pequena e folha (3 telas de mapa e 1 interface de servidor), então a decisão é **de mão dupla**: trocar custa ~1 a 2 dias por superfície se os mapas ficarem atrás de um componente fino por plataforma (sem camada de abstração além disso).

## 5. Como fica (restrições de implementação)
| Tema | Regra |
|---|---|
| Hospedagem dos tiles | `mapa.<domínio>` no nginx com `alias` para volume somente leitura; `Accept-Ranges`, `Cache-Control: public, max-age=31536000, immutable` em arquivo **versionado** (`mapa-AAAAMM.pmtiles`); **sem `gzip on`** (o PMTiles já comprime por tile); zona de limite própria e mais larga que a de arquivos. Motivo: o host de arquivos existente limita a 30 req/s com burst 100 e 50 conexões por IP (`infra/nginx/templates/default.conf.template:189-190`, taxa em `00-global.conf.template:16`; o limite por IP é a mesma origem do DT-086) e o CORS dele **não** libera `Range` (`:204-205`) |
| Segredo/chave | Nenhuma. URL dos tiles em env pública (`MAP_TILES_URL`) |
| CSP do admin | O `proxy.ts` monta CSP com nonce só em `/admin`: acrescentar `connect-src` do host de tiles, `img-src data: blob:` e o worker do MapLibre (preferir a build CSP com worker same-origin a liberar `worker-src blob:`). **Verificar** no spike S4 |
| Carregamento | `import()` dinâmico só na rota de despacho; mapa não entra no bundle do resto do admin |
| Pinos | Web: marcadores HTML (`button` 44 x 44, resolve a pergunta 7 do designer para ~30 pinos); nativo: anotações de view para <= ~10 marcadores |
| Preview iPhone (DEC-087) | O app roda no Safari (web) e no Expo Go sem módulo nativo: no web/Expo Go a tela de rastreio usa o estado "Mapa indisponível" **com distância e ETA em texto** (já especificado). Variante web com `maplibre-gl` fica opcional (§11 item 3) |
| 3G | Estilo mínimo, 1 a 2 pilhas de fonte só em faixas Latin, `maxzoom` 15 com sobre-zoom, cache de tiles do SDK ampliado, pacote offline da região **só se** couber (S3); estado "Mapa indisponível" nunca bloqueia ação |
| Atualização do extrato | Manual a cada ~3 a 6 meses `[HIPÓTESE]`: extrair, subir arquivo novo, trocar `MAP_TILES_URL`; guardar o arquivo no bucket de backup (a build diária de origem expira `[CG]`) |
| ETA e rota | Rota calculada uma vez por trecho; ETA ao vivo = projeção no servidor; com qualquer provedor futuro, **teto de chamadas por entrega** e alarme de orçamento |
| Tempo real | Posição pela sala `track:{orderId}` (ADR-004, SEC-198). **Com 2+ réplicas a emissão só chega se o `@socket.io/redis-adapter` do ADR-017 estiver implantado**; sem ele, cliente em outra réplica não recebe posição. Pré-requisito da R4, não da R3 |

## 6. Termos de uso (cache, armazenamento, atribuição, app próprio)
| Opção | Cache / armazenamento | Atribuição | Uso em app próprio | Fonte |
|---|---|---|---|---|
| OSM + Protomaps próprio | Livre para nós: o arquivo é nosso. **ODbL:** o extrato é base derivada; hospedá-lo público com atribuição e página de licença cumpre; **não misturar nossos pontos (lojas, destinos) dentro do arquivo**, só como camada por cima, para não contaminar a base com compartilhamento igual | "© OpenStreetMap contributors" visível no mapa e em "Licenças" (PRD RNF Licença); Protomaps pede crédito mas o requisito é o do OSM `[CG]` | Sim, comercial | Código BSD-3, desenho CC0, dados ODbL [PESQ §6]; detalhe ODbL `[CG]`, **jurídico confirma** |
| tile.openstreetmap.org | Política proíbe baixar área offline | Obrigatória | "Não recomendado em produção", pode bloquear sem aviso | [PESQ §6] |
| Build diária do Protomaps (origem do extrato) | Usar para **extrair uma vez**, não para servir o app | idem | Não servir o app a partir dela `[CG]` | **Verificar** no spike S1 |
| Google | Cache limitado e prazo curto para lat/lng; sem "scraping" de tiles; Place ID livre `[CG]` | Logo Google obrigatório | Conteúdo (geocode, rota) só com mapa Google `[CG]` | Termos de serviço do Maps Platform: **reler antes de contratar** |
| Mapbox | Offline só pelo SDK e dentro de limites `[CG]` | Logo + © Mapbox e OSM | Resultado de Directions só em mapa Mapbox `[CG]` | **Reler antes de contratar** |
| MapTiler / Stadia | Grátis só **não comercial** | Obrigatória | Produção exige plano pago | [PESQ §6] |
| OSRM demo público | n/a | n/a | "Não é para produção"; acesso pode ser retirado | [PESQ §7] |
| OSRM / Valhalla próprios | Livre; dados ODbL | OSM | Sim (OSRM BSD-2 `[CG]`, Valhalla MIT [PESQ §7]) | Extrato do Geofabrik é ODbL `[CG]` |

## 7. LGPD: localização do motoboy e do cliente
Base legal, aviso e retenção final são do jurídico (J8/J26, pendentes) e do PRD (F14: 7 dias); este ADR só garante que **a escolha do mapa não piora nenhum item**.

| Dado | Quem vê | Retenção | Por onde passa | Controle |
|---|---|---|---|---|
| Ponto bruto do motoboy (lat, lng, hora, precisão, flag suspeito) | O próprio motoboy; operação só de corrida ativa (tempo real); admin só em disputa, com motivo e auditoria; suporte só a posição atual; **nunca** exportação em massa | **7 dias** (job; depois só distância total e ponto e hora da entrega) | Do app à API (HTTPS) e ao Postgres; **nunca a provedor de mapa** | C-MOT-11/12, C-RT-08, RN-D7/D12 |
| Posição que o cliente recebe | Só o dono do pedido, só na janela RN-R1, 4 casas (~11 m), 1 por 5 s, `{lat,lng,ts,eta,firstName}` | Não persistida no cliente | Socket.IO `track:{orderId}` | C-RT-01/02/05 |
| Última posição em cache (se usado) | Servidor | TTL curto (<= 5 min, proposta) | Redis | Não é fonte de retenção |
| Posição do cliente | **Não coletada**; o destino é o pino do endereço (ADR-015) | Pelo prazo do pedido | Mostrado ao motoboy da corrida; apagado do aparelho ao fim (C-MOT-05) | WB-395 C9 |
| Consulta de tiles | IP e horário no log do nginx (política de logs do guia §10.1) | Conforme guia | **Só nosso servidor.** No PMTiles a requisição é por faixa de bytes de **um** arquivo, sem `z/x/y` na URL; o servidor não aprende o endereço visto sem reconstruir o diretório | Opção A |
| Cache de tiles no aparelho | Dado de mapa, não pessoal | Do SDK | Local | `allowBackup=false` já exigido |

Se um dia entrar provedor externo (planos B2 a B4): coordenadas de coleta e entrega (endereço do cliente) e IP vão a terceiro no exterior, o que exige contrato de operador (LGPD art. 33), atualização do inventário de privacidade e **revisão do Data Safety e do App Privacy do app do cliente** (WB-395 C8 afirma que ele não declara localização em segundo plano), porque SDKs de mapa pagos têm telemetria `[CG]`. **Não ligar sem parecer do Security e DEC do fundador.**

## 8. Impacto em infra (servidor mais barato)
Não há DEC de contratação de servidor (nenhum encontrado em `decisoes.md`); a referência é `deploy/guia-deploy.md` §2: **VPS de 2 a 4 vCPU, 4 a 8 GB, 40+ GB SSD, R$ 60 a 200/mês**, ainda não contratado (gasto do fundador). O piso de 2 vCPU/4 GB já está apertado: build do web ~2 GB (guia §3), `shared_buffers` 768 MB no perfil de 4 GB (guia §14.1), 300 a 500 MB por réplica da API (ADR-017) e Redis.

| Componente | RAM | Disco | CPU/banda | Cabe em 4 GB? |
|---|---|---|---|---|
| **Tiles PMTiles em nginx estático (A)** | ~0 (cache de páginas do SO, reaproveitável) | 0,2 a 0,5 GB por versão, 2 versões: ~0,4 a 1 GB `[HIPÓTESE]` | CPU desprezível; banda ~1 GB (1 mil usuários) a ~6 GB/mês (10 mil), a 0,6 MB por abertura `[HIPÓTESE]` | **Sim** |
| Pontos de GPS | n/a | ~80 bytes por ponto: 10 mil usuários (3 motoboys, 10 s) ~75 mil linhas em 7 dias, < 10 MB `[HIPÓTESE]` | 0,2 a 0,6 ponto/s (PRD RNF); sem impacto | **Sim** |
| Socket.IO rastreio | 1 mil sockets = 12 a 33 MB (ADR-017) | n/a | <= 8 clientes com mapa x 1 posição por 5 s | **Sim** |
| OSRM, **Sudeste inteiro** | Pré-processo na casa de **8 GB ou mais**, execução vários GB `[HIPÓTESE]` | ~1 a 3 GB | n/a | **Não** |
| OSRM ou Valhalla, **recorte da Grande SP** (plano B1) | 0,5 a 1,5 GB em execução; 2 a 4 GB no preparo (fazer fora do servidor) `[HIPÓTESE]` | 0,3 a 1 GB | CPU em rajada na atualização | Só com folga: **provável salto para 8 GB (~+R$ 40 a 100/mês)** `[HIPÓTESE]` |

Conclusão: a opção A **não muda o tamanho do servidor**. Dívida com o disco: o repositório e as sessões já estão no limite (I-05; esta sessão media 42 MB livres em 2026-11-23); o spike precisa de ~3 GB livres e rede.

## 9. Spike L5 (1 dia, sem gasto, executa quem tiver rede, Docker e disco)
Esta sessão **não executou o spike**: sem rede para `build.protomaps.com`, sem Docker, sem aparelho e com disco cheio. Nada abaixo é medição; o que foi verificado está marcado [V] no corpo.

Já verificado [V]: `maplibre-gl` 6.19.0 (BSD-3), `pmtiles` 4.5.0 (BSD-3), `@protomaps/basemaps` 5.7.2 (BSD-3), `@maplibre/maplibre-react-native` 11.5.1 (MIT; peer `expo >=54`, `react-native >=0.80`, usa MapLibre Native Android 13.6.1 e iOS 6.31.0); o binário Android 13.6.1 **contém** `PMTilesFileSource` e o esquema `pmtiles://` (suporte nativo a PMTiles por HTTP); o AAR tem 15,6 MB compactado com 4 ABIs. **Não verificado:** o mesmo suporte no iOS 6.31.0 e a compatibilidade com RN 0.88 e arquitetura nova.

| # | O que medir | Como | Passa se | Precisa de | Alimenta |
|---|---|---|---|---|---|
| S1 | **Tamanho do extrato** e termos da fonte | `pmtiles extract` da build do Protomaps com bbox (a) 4 municípios e entorno, (b) Grande SP, `maxzoom` 15 e 14; anotar data da build, tempo e licença do arquivo; ler os termos da build diária | (a) <= 300 MB e (b) <= 600 MB (senão cortar bbox ou usar z14); termo permite extrair | Rede, ~3 GB livres | §3, §8 |
| S2 | **Hospedagem** | nginx estático com `alias`, `Range`, CORS, zona de limite; testar RustFS como alternativa; `curl -r`, taxa de acerto, p95 por faixa de fora do servidor | 206 correto; p95 <= 300 ms; sem 429 com 40 faixas em 1 s | Docker | §5 |
| S3 | **Nativo Android** (R4) | Dev build com `maplibre-react-native` 11.5.1 no Expo 58/RN 0.88, fonte `pmtiles://` do S2, estilo de `@protomaps/basemaps` com glyphs/sprites locais; 2 marcadores com animação de 1 a 2 s | Abre sem erro; >= 30 fps em Android de entrada; delta do APK <= 20 MB com `abiFilters` arm; memória estável em 10 min | Android **real** (R-34); sem ele, emulador e "pendente" | §4, R4 |
| S3b | **Nativo iOS** | Mesma tela em dev build iOS | `pmtiles://` funciona; senão plano B só para iOS | Mac e iPhone | R4 |
| S4 | **Admin web** | `maplibre-gl` + `pmtiles` em rota dinâmica; CSP com nonce; pinos HTML | Mapa pinta sem violar a CSP; chunk do mapa <= 250 KB gzip `[HIPÓTESE]`; pinos acessíveis por teclado | Playwright | §5 |
| S5 | **3G** | Chrome DevTools "Slow 3G" e "Fast 3G" e, se possível, Android real em 3G: 1ª pintura do mapa, bytes da 1ª carga, 2ª carga com cache | Fast 3G <= 6 s até o mapa; Slow 3G <= 12 s com texto do ETA já visível; 1ª carga <= 0,8 MB | Navegador | Q6, §3 |
| S6 | **Zero terceiros** (WB-380 C4, C-MOT-13) | Teste Playwright que lista todas as requisições da tela de despacho | 0 requisições fora do nosso domínio (nenhum `openstreetmap.org`, `protomaps.github.io`, CDN de fonte ou sprite) | Playwright | Q8 |
| S7 | **Erro da heurística** | 30 pares loja-destino da região (seed); distância e tempo por linha reta x 1,3 x 6 min/km **contra** OSRM local em recorte (referência de rua, **sem trânsito**); medir também RAM e tempo de preparo do OSRM e do Valhalla | Erro mediano da distância <= 25% e do tempo <= 10 min; **preenche as células `[HIPÓTESE]` da §8** | Docker, ~3 GB | RN-D2, gatilho PRD |
| S8 | **Rotina de atualização** | Script do extrato + troca do arquivo versionado sem queda | Troca atômica; app antigo não quebra | nginx | DT-115 |

Saída do spike: trocar `[HIPÓTESE]` por [V] nesta ADR, marcar **Aceita** (todos os critérios) ou acionar o plano B da §10 (qualquer falha de S1 a S6). S3, S3b e a parte de aparelho do S5 podem rodar **antes da R4.0** sem atrasar a R3.

## 10. Plano B (em ordem, cada passo só com o gatilho dele)
| Se falhar... | Então | Custo e quem decide |
|---|---|---|
| S1 (extrato grande) ou S5 (3G lento) | Reduzir bbox/`maxzoom`; pacote offline só da operação; manter A | R$ 0 |
| S3 ou S3b (MapLibre Native ruim no Android de entrada ou no iOS) | **B3:** Google Maps SDK via `react-native-maps` só nos apps nativos (roda no Expo Go), mapa web do admin segue MapLibre; rota/ETA seguem heurística | Conta Google com faturamento e cartão, chave restrita por pacote e SHA-1, alerta de orçamento; **fundador**; Data Safety muda (§7) |
| S2 (hospedagem) | Mesmo arquivo no bucket R2/S3 público (CORS com `Range`) ou no RustFS | ~centavos (R2) |
| S7 mostra erro da heurística acima do limite ou o gatilho do PRD dispara (erro mediano > 10 min, 3 motoboys, 15 entregas/h) | **B1:** `RoutePlanner` `road` com Valhalla ou OSRM em **recorte** (preparo fora do VPS), geometria por rua e ETA por projeção | Possível VPS de 8 GB (~+R$ 40 a 100/mês `[HIPÓTESE]`); **fundador** |
| B1 custar mais horas do fundador do que a fatura | **B2:** Google Routes (ou Mapbox Directions) só como `RoutePlanner` pago, "rota uma vez", teto de chamadas por entrega; resultado só como número/tempo e conferir se o termo permite sem mapa do provedor | Fatura (§3: R$ 0 em cota; ~R$ 2.800/mês se mal desenhado); **fundador** + Security |
| Tiles/operação do extrato virar peso | **E:** MapLibre com tiles de provedor pago (mesmo renderizador, troca de URL e de estilo) | ~R$ 140 a ~1.150/mês [PESQ/CG]; **fundador** |
| Qualquer coisa | **G (degradação):** lista + texto + links Maps/Waze, já exigida por WB-380 C3 e WB-392 C7 | R$ 0 |

## 11. O que exige decisão do fundador
| # | Decisão | Recomendação | Dinheiro/conta |
|---|---|---|---|
| 1 | Autorizar o **spike L5** de 1 dia numa máquina com rede, Docker e ~3 GB livres | Sim | R$ 0; depende de I-05 e D-16 |
| 2 | **Conta Google/Mapbox com cartão** | **Não agora.** Só se o spike reprovar o nativo (B3) ou o PRD disparar o gatilho (B2) | Gasto recorrente possível; teto mensal e quem cadastra o cartão |
| 3 | Ver o **rastreio no iPhone pelo Safari/Expo Go**: aceitar texto no lugar do mapa, ou pedir variante web (~1 dia de dev) | Aceitar o texto até a R4 | R$ 0 |
| 4 | Aceitar a **rota em linha reta x 1,3 (estimada)** no piloto e os gatilhos de troca (§10) | Sim; é o que o PRD já propõe | R$ 0; risco: erro de ETA onde a rua dá volta |
| 5 | Servidor de produção (2 vCPU/4 GB x 8 GB) | 4 GB basta para o mapa (opção A); 8 GB só com B1 | R$ 60 a 200/mês (guia §2), **ainda sem autorização registrada** |

Nada disto foi contratado, cadastrado ou pago.

## 12. Consequências
- Positivas: custo adicional R$ 0 em 1 mil e em 10 mil usuários; nenhum terceiro vê posição, IP ou área; sem conta com cartão; plano B barato por causa de `RoutePlanner` e do "rota uma vez".
- Negativas e dívida assumida: **DT-113** (mapa nativo exige build de desenvolvimento; preview iPhone/Safari e Expo Go sem mapa), **DT-114** (ETA e ordem em linha reta, sem rua nem trânsito), **DT-115** (extrato atualizado à mão). Dependência de biblioteca comunitária (`@maplibre/maplibre-react-native`) para Expo/RN novos. Qualidade do OSM na periferia `[HIPÓTESE]`: o destino é o pino do endereço, o mapa é contexto.
- Reavaliar se: o spike reprovar (§10); erro mediano do ETA > 10 min; 3 ou mais motoboys ou 15 entregas/h; a OSMF/Protomaps mudar termos; `@maplibre/maplibre-react-native` ficar sem versão para o Expo/RN em uso; pedido de trânsito em tempo real; ODbL questionada pelo jurídico.
