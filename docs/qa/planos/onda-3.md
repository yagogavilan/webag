# Plano de teste: Onda 3 (descoberta: localização, home, busca, loja, produto, favoritos, sacola)

Dono: qa-engineer | Data: 2026-11-19 | Estratégia: `docs/qa/estrategia.md` | Fontes: `prd/cliente.md` (WB-001 a 005, 011 a 019, 020 a 022), `regras-de-negocio.md` (RN-03, RN-04, RN-05, RN-09), DEC-036b (raio global), DEC-040 (sem mensagem regional)
Legenda: `estrategia.md` §7. Tipo: UNIT, API (e2e com Postgres e Redis reais, supertest), CONC (concorrência), E2E-W (Playwright), E2E-M (Maestro/aparelho), A11Y, PERF. P0 = bloqueia release, P1 = deve passar, P2 = desejável. Resultado de cada caso: `docs/qa/relatorios/onda-3-5.md` §4.
Decisões do plano: o raio é global (`raio_max_km`), a loja não tem raio próprio; taxa de entrega vem da tabela do admin; "Mais vendidos" e "Lojas novas" seguem RN-03; a sacola é do servidor (sem id na URL).

## 1. Pré-condições
- Ondas 1 e 2 verdes. Postgres e Redis reais (banco e Redis só do QA), `PAYMENT_PROVIDER=fake`, tabela de frete padrão do ambiente de teste (1 faixa de R$ 5,00 até 15 km).
- Builders: `makeStore` (loja visível, produtos, estoque, horário), `isolatedPoint` e `northOf` (pontos a distância conhecida, PostGIS), `shopWith`, `customerAt`.
- Fora desta onda (outro dono): WB-006 a 010 (auth, onda 1), WB-031 criar avaliação (onda 5, trocas).

## 2. Casos

### 2.1 Localização e endereços (WB-001 a 005)
| ID | Origem | Caso (Dado/Quando/Então) | Tipo | P | SEC |
|---|---|---|---|---|---|
| O3-LOC-01 | WB-001 C2, RN-03 | Dado ponto dentro da cidade ativa, quando consulto a home, então só vêm lojas visíveis (aprovada, conta de recebimento ativa, 1+ produto ativo) a até `raio_max_km` | API | P0 | |
| O3-LOC-02 | WB-001 C4, WB-004 | Dado coordenada fora de qualquer região ativa, então a lista é vazia e o app mostra "ainda não chegamos" | API | P1 | |
| O3-LOC-03 | WB-001 C3 | Dado GPS negado, quando escolho cidade ou CEP, então vejo lojas da cidade sem frete exato ("a partir de") | E2E-M | P1 | |
| O3-LOC-04 | WB-002 C1/C2 | Dado CEP válido, então rua, bairro e cidade vêm preenchidos; CEP inexistente ou serviço fora do ar libera preenchimento manual | API | P1 | |
| O3-LOC-05 | WB-002 C3 | Dado endereço completo, quando salvo, então é geocodificado; falha pede o pino no mapa | API/E2E-M | P1 | |
| O3-LOC-06 | WB-002 C5 | Dado bairro ou cidade inativos, então o endereço não é salvo como de entrega (WB-004) | API | P1 | |
| O3-LOC-07 | WB-003 C1 | Dado 8 endereços, quando adiciono o 9º, então 409/422 com o limite | API | P2 | |
| O3-LOC-08 | WB-003 C2/C3 | Dado endereço atual excluído, então o app pede outro; o único excluído volta ao WB-001 | API/E2E-M | P2 | |
| O3-LOC-09 | WB-003, SEC-020 | Dado endereço de outro cliente, quando leio, altero ou apago, então 404 | API | P0 | SEC-020 |
| O3-LOC-10 | WB-005 C1 | Dado visitante, então home, busca, loja e produto funcionam sem login (rotas públicas) e a sacola exige login | API | P0 | |
| O3-LOC-11 | WB-005 C2/C3 | Dado visitante com sacola local que faz login, então o app volta à ação e a sacola se junta à da conta (RN-05: mesma loja soma até o estoque; lojas diferentes mantém a da conta e avisa) | API/E2E-M | P1 | |

### 2.2 Descoberta: home, ofertas, categorias, banners (WB-011, WB-012)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O3-HOM-01 | WB-012 C1, RN-03 | Dado lojas abertas e fechadas, então vêm abertas primeiro, depois distância, depois avaliação | API | P0 | |
| O3-HOM-02 | DEC-036b | Dado loja fora do `raio_max_km` mas perto de outra, então some da home e da busca (o raio não é por loja) | API | P0 | |
| O3-HOM-03 | WB-237, RN-04 | Dado distância exatamente no limite entre faixas (2,00 km), então vale a faixa seguinte `[de, ate)`; a última faixa inclui o raio | API | P0 | |
| O3-HOM-04 | WB-012 C2 | Dado promoção vigente, então "Ofertas" lista só produto com estoque e loja visível, maior desconto % primeiro | API | P1 | |
| O3-HOM-05 | WB-012 C3, RN-03 | Dado menos de 5 pedidos em 30 dias na região, então "Mais vendidos" não aparece; "Lojas novas" só com aprovação há <= 30 dias | API | P1 | |
| O3-HOM-06 | WB-012 C4 | Dado seção sem itens, então ela é omitida; sem nenhuma loja, estado vazio com "avisar quando chegar" | API/E2E-M | P1 | |
| O3-HOM-07 | WB-011 C1/C2/C4 | Dado banner ativo no período e cidade, então aparece em ordem; sem banner a área some; categoria sem loja visível não aparece | API | P1 | |
| O3-HOM-08 | WB-012 | Dado a mesma posição repetida, então a resposta vem do cache (idêntica) e expira por TTL curto; mudança de loja vale em seguida onde não há cache (página da loja) | API | P2 | |
| O3-HOM-09 | WB-012 | Dado coordenada ausente, fora da faixa ou tipo errado, então 400; rota pública responde sem login | API | P1 | |
| O3-HOM-10 | PERF | Dado 7 a 20 lojas e 80+ produtos no seed, então a home responde em p95 <= 500 ms no ambiente local `[HIPÓTESE do limite]` | PERF | P2 | |

### 2.3 Busca e filtros (WB-013, WB-014, WB-015)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O3-BUS-01 | WB-013 C1 | Dado "tenis" e "Tênis", então o resultado é o mesmo (acento e caixa) e tolera 1 erro de digitação | API | P1 | |
| O3-BUS-02 | WB-013 C2 | Dado termo, então abas Produtos e Lojas só de lojas que entregam no endereço | API | P0 | |
| O3-BUS-03 | WB-013 C3/C4 | Dado termo com 1 caractere, então não busca; sem resultado, sugestões de categoria | API | P1 | |
| O3-BUS-04 | RN-06, RN-03 | Dado produto com `disponível = estoque - reservado <= 0`, então some da busca e volta ao repor | API | P0 | |
| O3-BUS-05 | WB-013 C5 | Dado loja fechada, então o produto aparece com "Fechada" e o checkout bloqueia | API | P1 | |
| O3-BUS-06 | WB-014 C1/C2/C4 | Dado filtros combinados (categoria, preço, distância, avaliação, entrega grátis), então valem em E; mínimo > máximo é erro | API | P1 | |
| O3-BUS-07 | WB-014 C3 | Dado "aceita troca", então só lojas com troca voluntária > 0 dia | API | P2 | |
| O3-BUS-08 | WB-013, SEC | Dado termo com `%`, `_`, `'`, `\`, SQL e 10.000 caracteres, então sem erro 500, sem injeção e com limite de tamanho | API | P1 | SEC-020 |
| O3-BUS-09 | WB-015 C1 a C3 | Dado histórico, então 10 termos distintos, limpar apaga; visitante só no aparelho | E2E-M | P2 | |

### 2.4 Página da loja e do produto (WB-016, WB-017, WB-018, WB-019)
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O3-LOJ-01 | WB-016 C1 | Dado loja com avaliações, então nota só com 3+ (senão "Novo"), horário de hoje, tempo estimado e taxa da Webag para o endereço | API | P0 | |
| O3-LOJ-02 | WB-016 C2 | Dado produto sem estoque, então "Indisponível" ao final da vitrine, fora de ofertas e busca | API | P1 | |
| O3-LOJ-03 | WB-016 C3, RN-03 | Dado loja fechada ou pausada, então navegável, com `opensAt`; pausa sem prazo não tem previsão | API | P1 | |
| O3-LOJ-04 | WB-016 C4 | Dado endereço fora do raio por link, então "Não entrega no seu endereço" e retirada se aceita e a <= 10 km | API | P1 | |
| O3-LOJ-05 | RN-03, SEC-020 | Dado loja em análise, suspensa, sem conta de recebimento ou inexistente, então 404 (nunca vaza) | API | P0 | |
| O3-LOJ-06 | WB-017 C2 | Dado variações, então estoque por variação e as sem estoque não são selecionáveis | API/E2E-M | P1 | |
| O3-LOJ-07 | WB-017 C5, RN-05 | Dado promoção que expira com a tela aberta, então ao adicionar o preço é o vigente e o cliente é avisado | API | P0 | |
| O3-LOJ-08 | WB-017 C6 | Dado produto pausado ou removido pela moderação, então "Produto indisponível" (200 com aviso) | API | P1 | |
| O3-LOJ-09 | WB-018 | Dado avaliações, então média só com 3+, 10 por página, mais recentes primeiro, resposta da loja, nome reduzido ("Maria S.", LGPD) | API | P1 | |
| O3-FAV-01 | WB-019 C1/C3 | Dado login, favoritar sincroniza entre sessões; item indisponível aparece com selo e dá para remover | API | P2 | |
| O3-FAV-02 | WB-019, SEC-020 | Dado favorito de outro usuário, então 404; visitante é levado ao login | API | P1 | SEC-020 |

### 2.5 Sacola e cupom (WB-020, WB-021, WB-022) e acesso
| ID | Origem | Caso | Tipo | P | SEC |
|---|---|---|---|---|---|
| O3-SAC-01 | WB-020 C1, RN-05 | Dado item adicionado, então resumo em centavos inteiros com subtotal, frete da tabela e total; quantidade absoluta (`PUT`), repetir é seguro | API | P0 | |
| O3-SAC-02 | WB-020 C2/RN-05 | Dado quantidade > estoque disponível ou > `item_qtd_max`, então ajusta ao máximo e avisa; zero e negativo são 400 | API | P0 | |
| O3-SAC-03 | WB-020 C3, RN-05 | Dado preço mudou, estoque caiu, esgotou ou saiu do ar, então aviso por item e total recalculado com o preço vigente | API | P0 | |
| O3-SAC-04 | WB-021, DEC-006 | Dado item de outra loja, então 409 com a loja atual; só trocar esvazia | API | P1 | |
| O3-SAC-05 | WB-020 C5, RN-04 | Dado subtotal abaixo do pedido mínimo, então bloqueio "Faltam R$ X"; frete grátis acima de X vale pelo subtotal, X deve ser > mínimo (422) | API | P0 | |
| O3-SAC-06 | WB-020 C6 | Dado sacola parada além de `carrinho_validade_dias` (relógio injetado), então esvaziada | API | P2 | |
| O3-SAC-07 | WB-020 | Dado 20 requisições simultâneas na mesma sacola, então sem item duplicado e sem 500 (trava por conta) | CONC | P1 | |
| O3-SAC-08 | SEC-020 | Dado outra conta, então só vê e altera a própria sacola (não há id na URL) | API | P0 | SEC-020 |
| O3-CUP-01 | WB-022 C1/C3/C5 | Dado cupom válido, então desconto em linha própria; outro cupom substitui; remover volta ao original | API | P0 | |
| O3-CUP-02 | WB-022 C2 | Dado cupom inexistente, expirado, esgotado, já usado ou abaixo do mínimo, então motivo específico e total inalterado | API | P0 | |
| O3-CUP-03 | WB-022 C4, HIP-037 | Dado cupom que zera o total, então cobra R$ 1,00 | API | P1 | |
| O3-CUP-04 | WB-022 C7, RN-09, SEC-060 | Dado cupom da plataforma maior que `application_fee`, então o desconto é cortado e o resumo mostra o valor aplicado | API+PROP | P0 | SEC-060 |
| O3-CUP-05 | RN-09, SEC-061 | Dado membro da loja, então não usa cupom na própria loja | API | P0 | SEC-061 |
| O3-CUP-06 | WB-022, SEC-005 | Dado tentativas repetidas de códigos, então limite de taxa protege contra adivinhação | API | P1 | SEC-005 |
| O3-CUP-07 | WB-022 C6, DEC-014 | Dado e-mail não confirmado, então cupom da plataforma e de primeira compra recusados | API | P1 | |

### 2.6 Experiência e acessibilidade (aparelho)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O3-UX-01 | WB-035 | Modo avião na home e na sacola: último estado salvo com "Atualizado há X min" e volta ao reconectar | E2E-M | P1 |
| O3-UX-02 | A11Y | Home, loja, produto e sacola a 360x640 com fonte 200%: sem corte, alvos >= 44 px, leitor de tela anuncia preço e estado | A11Y | P1 |
| O3-UX-03 | RN-17 | Botões de formulário sempre ativos; ao tocar com erro, mostra o erro e leva o foco ao campo | E2E-M/UNIT | P2 |
| O3-UX-04 | PERF | Aparelho de 2 GB de RAM: rolagem da home e da vitrine sem travar (lista virtualizada) | E2E-M | P2 |
| O3-UX-05 | DEC-040 | Nenhum texto do app usa "compre de quem é daqui" ou mensagem regional (grep nas strings do app) | UNIT | P2 |

## 3. Critérios de saída da onda 3
Todo P0 passou com evidência; nenhum bug Crítico ou Alto aberto; casos E2E-M e A11Y listados para o fundador. Parecer em `relatorios/onda-3-5.md`.
