# Revisão de segurança: mudanças de desempenho do app (pós-G4, DEC-078)

- **Autor:** security-engineer | **Data:** 2026-11-22 | **Branch:** `claude/admiring-lamport-62tq1a`
- **Commits:** `0ea7116` (Metro: `@webag/shared/native` e stub de idiomas do Zod), `563a3e1` (prefetch na abertura e fontes por peso), `70b9351` (prefetch no toque), `5eeffbe` (splash no HTML do web), `1242406` (relatório do QA). Também o servidor estático do `pnpm iphone --producao` (`scripts/perf/static-server.mjs`, `5b5de02`) e os pedidos de cache ao backend (`docs/qa/performance/pedidos-ao-backend.md`).
- **Não analisado:** o medidor `scripts/perf-app.mjs` (ferramenta local, fora do caminho de produção), os JSON de medição, o `web-insecure-context` (anterior a estes commits).
- **Veredito:** **APROVADO, sem achado SEC.** Nada enfraquece controle existente. O G4 não muda. A persistência do catálogo no aparelho fica **liberada com as condições P1 a P7** (§3).

## 1. O que foi verificado

| Mudança | Risco | Verificação | Resultado |
|---|---|---|---|
| `metro.config.js`: `@webag/shared` vira `@webag/shared/native` | Alto (resolução de módulos) | O app nunca importa `schemas` (Grep em `apps/mobile`: só tipos, cliente gerado, `apiFetch`, `configureApiClient`). `packages/shared/src/http` não usa Zod. Os formulários validam com schemas próprios (`features/auth/schemas.ts`, `features/address/schemas.ts`, `profile.tsx`), que continuam no bundle. A validação que vale é a do servidor (`ZodPipe`), que não muda | Sem perda de validação. Se alguém importar `schemas` no app no futuro, o valor fica `undefined` e o app quebra (falha fechada, não contorno) |
| Stub de `zod/.../locales/index.js` | Médio | O Zod registra o inglês por import direto em `zod/v4/classic/schemas.js:6-12`; o stub só esvazia o namespace `z.locales`, que o app não usa. A regra de validação não depende das mensagens | Sem efeito em segurança |
| `prefetchStartup` e prefetch no toque (`queries.ts`) | Médio | Só rotas `@Public` de catálogo (`/v1/home`, categorias, regiões, banners, loja, produtos, produto), com as mesmas coordenadas arredondadas (4 casas) que a tela já mandava. Em memória (`gcTime` de 24 h em `src/api/query-client.ts:15`), nada em disco. O `/v1/home` não é personalizado (`discovery.controller.ts:42-48`) | Sem exposição nova. Observação (não é achado): o prefetch no toque aumenta requisições ao limite `discovery` (120/min por IP); se clientes atrás de CGNAT receberem 429, revisar o limite antes de culpar o app |
| Splash no `public/index.html` | Baixo | Conteúdo estático; o script só lê a `meta theme-color` do próprio HTML. O export web do app não é servido em produção (o nginx não tem rota para ele) | Sem risco. Se um dia for servido com CSP estrita, o script inline precisará de hash |
| Servidor estático do `--producao` | Alto (rede local) | Carrega a pasta do export na memória e serve por consulta a um `Map` (`static-server.mjs:60-70, 101`): não há acesso ao disco por requisição, então não existe travessia de caminho; ainda assim recusa `..` e `\0` (`:96`) e responde 400 a URL malformada. Cabeçalhos: `nosniff`, HTML `no-cache`, hash `immutable`. Escuta em `0.0.0.0:8081`, a **mesma porta** que o Metro já expunha no modo desenvolvimento, que expõe mais (código-fonte, `/symbolicate`, depurador). O aviso de rede e o firewall restrito à sub-rede (SEC-191) cobrem a porta | Exposição igual ou menor que a do modo dev. Sem CSP e sem `X-Frame-Options`: aceitável num servidor de teste em rede local |
| O que vai no bundle exportado | Alto (segredo) | Só variáveis `EXPO_PUBLIC_*` entram no bundle; as usadas são URL da API e da web, ambiente, modo de pagamento, chave **pública** do MP, WhatsApp de suporte e a flag de texto jurídico revisado. Nenhuma é segredo | OK. Conferir na máquina do fundador que `apps/mobile/dist/web` não tem `*.map` (o `expo export` não gera sem `--source-maps`) |
| Pedidos de cache ao backend (#5 e #6) | Médio | Hoje as rotas com coordenadas na URL são `private` (`discovery.controller.ts:45`, `browse.controller.ts:26,50`) e as sem coordenadas são `public` (`banners.controller.ts:36`) | **Condição ao backend-dev:** `public` e CDN só para categorias, regiões, banners e produto sem ponto. Rotas com `lat`/`lng` continuam `private` (a URL com coordenadas iria para cache e log compartilhados). `ETag` é livre. No CORS, `Access-Control-Max-Age` e a lista de cabeçalhos podem entrar, mas a origem continua em lista fechada, nunca `*` |

Testes existentes que cobrem: `apps/mobile/__tests__/prefetch-startup.test.tsx` (prefetch não duplica e não roda sem endereço). Não há teste de que nada vai para disco: hoje não é necessário, porque nenhum persistidor do React Query existe (Grep: `persistQueryClient`, `createAsyncStoragePersister` sem resultado).

## 2. Pergunta do mobile-dev: pode persistir o catálogo público no aparelho?

**Pode, com as condições abaixo.** O motivo de não exigir criptografia é factual: o endereço completo, com latitude e longitude, **já fica em AsyncStorage** (`src/features/address/store.ts:15,40-43`, SEC-122, com dono e limpeza no fim da sessão). Gravar a resposta da home ao lado não cria um dado de localização novo, desde que a chave não crie uma cópia nova das coordenadas e a limpeza siga a mesma regra.

## 3. Condições (viram critério de aceite da história de persistência)

| ID | Condição | Como verificar |
|---|---|---|
| P1 | **Lista de permissão por chave**: só `categories`, `regions`, `banners`, `home`, `store`, `store-products` (1ª página) e `product`. Implementar com `shouldDehydrateQuery` lendo uma lista explícita, **nunca** "persistir tudo menos X" | Teste unitário: com `me`, `orders`, `order`, `cart`, `my-coupons`, `favorites`, `exchanges` e `addresses` no cache, o conteúdo gravado só tem chaves da lista; chave nova fora da lista não é gravada |
| P2 | **Chave sem coordenadas novas**: guardar só a home do endereço **atual**, com chave pelo id do endereço (que já está no disco), ou coordenadas com no máximo 3 casas (cerca de 110 m). A requisição de revalidação continua com o ponto da tela | Inspecionar o valor gravado: nenhuma latitude ou longitude com 4 casas ou mais fora de `webag.addresses.v1` |
| P3 | **Validade em disco de até 24 h** (`maxAge`) e descarte por versão do app ou da API (`buster`). O que vem do disco aparece como dado antigo e é revalidado na abertura | Teste: entrada com 25 h é descartada; troca de versão descarta tudo |
| P4 | **Mesma limpeza do endereço (SEC-122)**: apagar no `onSessionCleared` (sair, sessão revogada, exclusão de conta), na troca de usuário no aparelho e ao apagar o endereço a que a home pertence | Teste: sair da conta, depois ler o armazenamento: nenhuma chave do catálogo persistido |
| P5 | **Dado do disco é entrada não confiável**: falha de leitura ou formato inesperado descarta a entrada. Preço e disponibilidade vindos do disco servem só para exibir; sacola e checkout sempre usam o valor do servidor (já é assim: RN-09, cotação no servidor) | Teste: valor corrompido no disco não derruba o app; checkout com preço antigo em cache recebe a mudança de preço do servidor |
| P6 | **Nunca em disco sem criptografia**: token e sessão (só SecureStore), pedido, perfil, endereço vindo da API, sacola do servidor, cupom pessoal, favoritos, dados de pagamento, token de push, código de entrega ou de retirada | Revisão de código do PR mais o teste da P1 |
| P7 | Tamanho máximo do que é gravado (cerca de 1 MB); no web, `localStorage` é aceitável porque o conteúdo é público | Teste: catálogo acima do limite não é gravado e o app segue funcionando |

O Data Safety não muda: dado que fica só no aparelho não conta como "coletado" (`inventario-lojas.md` §2).

## 4. Limites
Revisão estática dos commits. Não executei o export nem medi o servidor estático. Não conferi o painel do Expo nem o `.env` da máquina do fundador (fora do repositório).
