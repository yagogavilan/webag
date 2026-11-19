# Inventário para o Data Safety (Google Play) e o App Privacy (App Store)

- **Dono:** security-engineer. **Conferido contra o código em:** 2026-11-19, branch `claude/admiring-lamport-62tq1a` (`dad9c96`; app e web em `b726960`). Mudanças desde `98764b2`: geocodificador da API configurável e desligado por padrão (SEC-169), cupom pessoal de compensação, "não recebi", build do app recusa URL http (SEC-172). Tela "Meus dados" e tela de Licenças **não** criam dado novo (nome e celular já estavam no item 1/3). **Substitui** a tabela resumida de `docs/deploy/checklist-publicacao-lojas.md` §5 e a de `revisao-onda6-frontends.md` (o checklist deve apontar para cá).
- **Escopo:** só o **app** (Expo, consumidor). O painel do lojista e o admin são web e não entram nos formulários das lojas. O registro de operações completo (art. 37) é o de `docs/produto/prd/lgpd.md` §Regras.
- **Regra:** mudou o app ou a API (dado novo, SDK novo, Sentry no app, login social), atualize esta página **antes** do envio. Formulário divergente do app é motivo de remoção nas duas lojas.
- Bases legais e prazos são recomendação técnica `[validar com o jurídico]`.

## 1. Dados que o app envia para fora do aparelho

"Onde" = o que comprova no código. "Comp." = compartilhado com terceiro no sentido das lojas (operador contratado que só processa para a Webag **não** conta; ver §3).

| # | Dado | Onde (código) | Obrigatório? | Finalidade | Base legal LGPD | Comp. | Retenção | Exclusão |
|---|---|---|---|---|---|---|---|---|
| 1 | Nome | `identity/auth.schemas.ts:33`, `users.name` | Sim | Conta, pedido, entrega | Contrato (art. 7, V) | Loja do pedido (rótulo e nota) | Enquanto a conta existir | Anonimizado em até 15 dias após as 72 h |
| 2 | E-mail | `auth.schemas.ts`, `users.email` | Sim | Login, avisos, recuperação de senha, pagamento (MP recebe como pagador) | Contrato | Não (MP é operador do pagamento, §3) | Conta | Idem |
| 3 | Celular | `auth.schemas.ts:35` (obrigatório), `users.phone` | Sim | Contato da entrega; antifraude do cupom (SEC-060) | Contrato; legítimo interesse (antifraude) | Loja e motoboy do pedido (mascarado na lista, "Revelar" auditado; SEC-144) | Conta; na corrida, `pii_corrida_retencao_dias` (7) | Idem |
| 4 | Endereço (CEP, rua, nº, complemento, bairro, cidade, UF) e o ponto no mapa | `addresses.service.ts`, `user_addresses`, cópia em `orders.address` | Para entrega (retirada não pede) | Entrega, frete, raio, prazo; antifraude do cupom | Contrato; legítimo interesse | Loja e motoboy do pedido; **ViaCEP recebe o CEP direto do app** (`features/address/cep.ts:33`); o **geocodificador do sistema** (Apple/Google) recebe o endereço digitado (`location.ts:geocodeAddress`); na API, **ViaCEP** recebe o CEP e o **geocodificador opcional** (`GEOCODER_URL`, vazio por padrão; o boot de produção recusa o Nominatim público) recebe só rua, cidade e UF **do CEP**, nunca o número nem o complemento (`stores/geocoding.ts`, SEC-169). `user_addresses.pin_verified` é só um indicador | Conta; no pedido, reduzido a cidade/UF na anonimização | Endereços salvos apagados; o do pedido reduzido |
| 5 | Localização do aparelho (só com o app aberto) | `features/address/location.ts:52` (`Accuracy.Balanced`); enviada nas buscas como `lat/lng` e mascarada no log | Não (há escolha manual de cidade) | Mostrar lojas que entregam perto | Contrato (procedimento preliminar) + permissão do sistema | Não | **Não guardada na API** (só no aparelho, como endereço aproximado) | Some ao sair da conta |
| 6 | CPF do pagador (só se o Mercado Pago exigir: `MP_PAYER_DOCUMENT_REQUIRED`) | `checkout.tsx` (`payerDocument`); API guarda só o HMAC (`orders.payer_document_hash`) e, por 15 min, cifrado no Redis | Condicional | Exigência do meio de pagamento; antifraude do cupom | Contrato; legítimo interesse (antifraude) | Mercado Pago (§3) | HMAC: com o pedido (fiscal) | HMAC fica (não reverte ao CPF) |
| 7 | Pedidos (itens, valores, datas, forma de pagamento, status, "não recebi", pedido de cancelamento por atraso) e cupons pessoais de compensação | `orders`, `order_items`, `payment_attempts`, `order_cancel_requests`, `coupons.owner_user_id` (`GET /v1/me/coupons`) | Sim | Executar a compra, trocas, estornos, fiscal | Contrato; obrigação legal (art. 7, II) | Loja do pedido | `retencao_fiscal_anos` (5) | Mantido sem identificação direta |
| 8 | Fotos do defeito (troca) | `exchanges/PhotoPicker.tsx:66,71` (câmera ou seletor); API recodifica sem EXIF/GPS (`media.service.ts:128`) | Não | Analisar a troca | Contrato; exercício de direito (CDC) | Loja da troca | `retencao_foto_troca_dias` (180) após encerrar | Apagadas |
| 9 | Avaliação (nota, texto, "como vestiu"), resposta a denúncia, motivos de cancelamento e de troca | `reviews`, `content_reports`, `order_cancel_requests`, `exchange_requests` | Não | Reputação, moderação, atendimento | Legítimo interesse; contrato | Avaliação: pública no app, sem nome completo | Conta | Texto livre anonimizado (SEC-158) |
| 10 | Histórico de busca | `search_history` (`/v1/me/search-history`) | Não | "Buscas recentes" | Legítimo interesse (o titular apaga) | Não | Últimas buscas, enquanto a conta existir | Apagado |
| 11 | Favoritos e sacola | `favorites`, `carts`, `cart_items` | Não | Funcionamento | Contrato | Não | Sacola: `carrinho_validade_dias` (7); favoritos: conta | Apagados |
| 12 | Abertura de notificação de campanha | `push_campaign_recipients.opened_at` (`markPushCampaignOpened`) | Não (só com consentimento de marketing) | Medir campanha | Consentimento (art. 7, I) | Não | Conta | Apagado |
| 13 | Consentimentos e aceite de termos | `consents`, `terms_acceptances` (IP truncado /24, família da plataforma; SEC-159/173) | Sim (termos) / Não (marketing) | Prova do aceite e do consentimento | Obrigação legal; legítimo interesse | Não | Prazo prescricional `[jurídico]` | Mantido com IP truncado |
| 14 | ID aleatório do aparelho (`X-Device-Id`, gerado pelo app, no SecureStore) | `api/http.ts:77`, `sessions.device_id` | Sim | Segurança da sessão; antifraude (multiconta, SEC-060/131) | Legítimo interesse | Não | Sessão: 30 dias após expirar (`retention.service.ts:81`) | Apagado com as sessões |
| 15 | Token de push (Expo) | `push_devices.token` | Não (permissão do sistema) | Status do pedido; marketing só com consentimento | Contrato; consentimento (marketing) | Expo, FCM e APNs (operadores) | Até sair ou excluir | Apagado |
| 16 | IP e user agent de cada requisição | `access_log` (Marco Civil) | Sim (técnico) | Segurança e obrigação legal | Obrigação legal (MCI art. 15) | Não | `retencao_log_acesso_meses` (6) | Fica até o prazo (art. 16, I) |

**Não coletados pelo app** (conferido): dados de cartão (a página segura `/pagar/cartao` abre no navegador do sistema e o Mercado Pago tokeniza; regra inviolável nº 2), data de nascimento (só a declaração de maioridade), contatos, agenda, SMS, áudio, arquivos, saúde, histórico de navegação, apps instalados, identificador de publicidade, leitura da área de transferência (o app só **escreve** o código PIX), diagnóstico e crash (o app não tem Sentry; DT-039), localização em segundo plano.

## 2. Google Play: Data Safety

| Pergunta | Resposta |
|---|---|
| O app coleta ou compartilha dados? | Sim |
| Dados criptografados em trânsito? | Sim (HTTPS obrigatório em produção na API, no web e no build de loja do app: SEC-172) |
| O usuário pode pedir a exclusão? | Sim: no app (Conta > Privacidade e dados > Excluir minha conta) e em `https://<domínio>/excluir-conta`, que exclui **sem o app** (e-mail + código, ou e-mail + senha; SEC-166 fechado em 2026-11-19). Marcar quando a URL estiver no ar com o domínio real |
| Revisão de segurança independente (MASA)? | Não |

| Categoria > tipo | Itens (§1) | Coletado | Compartilhado | Efêmero? | Obrigatório | Finalidades a marcar |
|---|---|---|---|---|---|---|
| Informações pessoais > Nome | 1 | Sim | Sim (loja) `[ver §3]` | Não | Sim | Funcionalidade; Gerenciamento da conta |
| Informações pessoais > E-mail | 2 | Sim | Não | Não | Sim | Funcionalidade; Gerenciamento da conta; Comunicações do desenvolvedor |
| Informações pessoais > Telefone | 3 | Sim | Sim (loja, motoboy) `[ver §3]` | Não | Sim | Funcionalidade; Prevenção de fraude e segurança |
| Informações pessoais > Endereço | 4 | Sim | Sim (loja, motoboy; ViaCEP) `[ver §3]` | Não | Não (só entrega) | Funcionalidade; Prevenção de fraude |
| Informações pessoais > Outras informações | 6 (CPF) | Sim | Não (MP é operador) | Não | Não | Funcionalidade; Prevenção de fraude |
| Localização > Aproximada | 5 | Sim | Não | **Sim** | Não | Funcionalidade |
| Informações financeiras > Histórico de compras | 7 | Sim | Sim (loja do pedido) `[ver §3]` | Não | Sim | Funcionalidade |
| Fotos e vídeos > Fotos | 8 | Sim | Sim (loja da troca) `[ver §3]` | Não | Não | Funcionalidade |
| Atividade no app > Outro conteúdo gerado pelo usuário | 9 | Sim | Não | Não | Não | Funcionalidade |
| Atividade no app > Histórico de pesquisa no app | 10 | Sim | Não | Não | Não | Funcionalidade; Personalização |
| Atividade no app > Interações no app | 11, 12 | Sim | Não | Não | Não | Funcionalidade; Análise (12) |
| IDs do dispositivo ou outros IDs | 14, 15 (e o IP do item 16, por prudência) | Sim | Não | Não | Sim | Funcionalidade; Prevenção de fraude e segurança |

Android: `ACCESS_FINE_LOCATION` e `ACCESS_BACKGROUND_LOCATION` bloqueadas (`app.config.ts:50-53`), câmera só para a troca, sem permissão de galeria (seletor do sistema). Justificativas de permissão: localização ("lojas perto de você, só com o app aberto"), câmera ("foto do defeito na troca"), notificações ("status do pedido").

## 3. "Compartilhado" e "operador": o que declarar

| Destinatário | Recebe | Natureza | Declarar como compartilhado? |
|---|---|---|---|
| Loja do pedido | Nome, telefone (mascarado + "Revelar"), endereço, itens | Controladora própria para entrega e nota (Termos do Lojista, item 3) | **Recomendado: sim** (Google isenta transferência iniciada pelo usuário, mas a loja é outra controladora; declarar é o lado seguro) `[jurídico]` |
| Motoboy (via operação, WhatsApp) | Nome, telefone, endereço da entrega | Prestador da Webag | Não (operador), mas está na política (SEC-146) |
| Mercado Pago | E-mail, CPF (se exigido), valor; cartão direto no navegador | Operador do pagamento e controlador do próprio antifraude | Não como "compartilhamento" (operador); citar na política |
| Expo, FCM, APNs | Token e texto da notificação | Operadores | Não |
| E-mail transacional, armazenamento (S3/RustFS), servidor | O necessário ao serviço | Operadores | Não |
| **ViaCEP** (do app e da API) | CEP e IP do aparelho | Serviço público sem contrato | **Sim, ou eliminar:** o app ainda consulta direto (`features/address/cep.ts:33`); a API já oferece `GET /v1/cep/{cep}` para qualquer conta (falta o app usar: `fila-mobile.md` M.6). Citar na política |
| **Geocodificador da API** (opcional, `GEOCODER_URL`) | Rua, cidade e UF do CEP (sem número nem complemento; cache por CEP) | **Desligado por padrão.** O Nominatim público é recusado no boot. Se o fundador contratar um provedor, ele é operador com contrato | Não (operador); se ligar, citar na política e no registro de operações |
| Geocodificador do sistema (Apple/Google) | Endereço digitado | Serviço do sistema operacional | Não `[validar]`; citar na política |

## 4. App Store: App Privacy

| Tipo (Apple) | Itens | Vinculado à pessoa | Rastreamento | Finalidades |
|---|---|---|---|---|
| Contact Info > Name, Email Address, Phone Number, Physical Address | 1 a 4 | Sim | Não | App Functionality; Other Purposes (antifraude) para phone/address |
| Location > **Precise Location** enquanto o SEC-179 não for corrigido; depois **Coarse Location** | 5 | Não (não é guardada) `[se a Apple entender que é, marcar Sim]` | Não | App Functionality |
| Other Data (CPF) | 6 | Sim | Não | App Functionality |
| Purchases > Purchase History | 7 | Sim | Não | App Functionality |
| User Content > Photos or Videos | 8 | Sim | Não | App Functionality |
| User Content > Other User Content; Customer Support (denúncia, motivos) | 9 | Sim | Não | App Functionality |
| Search History | 10 | Sim | Não | App Functionality |
| Usage Data > Product Interaction | 11, 12 | Sim | Não | App Functionality; Analytics (12) |
| Identifiers > Device ID | 14, 15 | Sim | Não | App Functionality; Other Purposes (segurança) |
| Diagnostics | — | — | — | Não coletado (rever se o app ganhar Sentry) |

"Data Used to Track You": **nenhum** (sem SDK de publicidade, sem ATT). Exclusão de conta: dentro do app (5.1.1(v)); informar o caminho nas notas ao revisor. Privacy Manifest: conferir o gerado pelo Expo no build.

## 5. O que a política de privacidade precisa dizer (insumo ao jurídico)

O texto atual (seed `apps/api/seed/onda1.ts`, "Minuta técnica") cobre só finalidade geral. Faltam: a lista de §1 (incluindo busca, fotos, avaliações, ID do aparelho e IP); quem recebe (§3); prazos de retenção (§1); CPF "só quando o meio de pagamento exigir" (hoje diz "não coletamos CPF", o que vale só para o cadastro); o canal do encarregado e o prazo de 15 dias; a exclusão em 72 h + anonimização e o que fica (art. 16); a localização "só com o app aberto"; o uso antifraude de telefone, endereço, aparelho e documento (legítimo interesse, com o direito de oposição). A página `/excluir-conta` deve citar os mesmos números (SEC-178).
