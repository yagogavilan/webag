# Pendências de contrato: web do lojista (Onda 2) para o backend

> Origem: mobile-dev (web), 2026-11-18. Telas L1 a L8 e C1 a C5 de `docs/design/telas/onda-2-lojista-admin.md`. Os endpoints de `stores` existem no `openapi.yaml` e no `packages/shared`; o web ainda chama pelo BFF com módulos tipados à mão (`apps/web/src/lib/api/lojista.ts` e `store-settings.ts`, DT-014) e vai migrar para o cliente gerado quando o backend fechar a lista abaixo.

| # | Pendência | Impacto na tela |
|---|---|---|
| 1 | `GET /stores/:id` devolver `step` (maior etapa concluída), `slaBusinessDays` (parâmetro `aprovacao_loja_sla_dias_uteis`), `hasActiveProduct` e nome, tipo e tamanho dos documentos enviados | Hoje o web deduz a etapa pelas pendências de `onboarding`, fixa o prazo em 2 dias úteis e não mostra o nome do arquivo depois de recarregar |
| 2 | `GET /stores/:id` devolver `fiscalResponsibilityAccepted` | O web assume "aceito" quando a razão social já existe (CNPJ) |
| 3 | Endpoint de lista de espera (`POST /waitlist`: e-mail, tipo `merchant_signup` ou `city`, consentimento) | Cadastro fechado e cidade não atendida (L1, L4) |
| 4 | Aceite de `reviewItems` já corrigidos: devolver `fixed` por item (hoje o item some da lista quando o lojista reenvia o documento) | A tela de correção só sabe o que falta, não mostra "Corrigido" |
| 5 | `POST /stores/:id/delivery/preview` aceitar a configuração em edição (`override`) além da salva | A prévia da tela C4 usa o que está salvo; o texto da tela avisa para salvar antes |
| 6 | Expor os limites de configuração (`raio_max_km`, `taxa_coleta_max_cents`, faixas máximas) em leitura pública do lojista | O web só valida o que é fixo (raio mínimo de 1 km, taxa de R$ 50,00 e R$ 30,00); o máximo do raio vem na mensagem da API |
| 7 | `GET /stores/:id/settings` informar quantos pedidos de retirada e entrega estão em andamento | Aviso ao desligar retirada ou suspender fica genérico ("seguem normalmente") |
| 8 | Aviso de pausa terminando (push ou evento) e "Aberta/Pausada" no cabeçalho sem nova chamada pesada | O chip de pausa do cabeçalho (onda-2 §0.6) ainda não existe; pausar e reabrir ficam em Minha loja e em Horários |
| 9 | Conexão do Mercado Pago depois da aprovação: confirmar que o `redirect_uri` configurado leva a `/lojista/onboarding/4` | O web aceita o retorno do OAuth nessa rota para loja em qualquer estado, menos recusada e suspensa |
| 10 | Edição de loja pelo admin com as telas do lojista (A3, "modo admin"): os endpoints `PUT /admin/stores/:id/settings/:section` e `PATCH /admin/stores/:id` existem, mas o web ainda não tem o diálogo "antes e depois" | A3 só suspende, reativa e consulta |

| 11 | Convite de funcionário: `name` é obrigatório na API (mín. 2) e opcional na spec (L9); falta "Reenviar convite" (rota) | O web exige o nome; o item "Reenviar convite" do menu não existe |

**Não feito nesta rodada (registrado para a próxima):** L10 Aceitar convite (o BFF tem `accept-invite`, falta a tela em `/lojista/convite` com "Confirmar senha"), chip de pausa no cabeçalho (#8) e a edição de loja pelo admin (#10). L9 Equipe está pronta (`/lojista/equipe`).

**Achados corrigidos no E2E (não são do contrato):** o cadastro caía em "This page couldn't load" ao pedir o código por e-mail (faltava o `ToastProvider` nas rotas de acesso) e a etapa 3 voltava para si mesma depois dos documentos (o `step` ficava velho no cache).

## Lacunas apontadas pelo web do catálogo (2026-11-18, mobile-dev)
> Para o backend-dev. O web ficou assim por falta de contrato; não foi contornado.

| # | Lacuna | Efeito hoje |
|---|---|---|
| C1 | Contrato sem denúncias de produto, foto e contagem de remoções por loja na moderação | Aba "Denunciados" virou "Pausados e Removidos" |
| C2 | Importação só CSV (1 MB), sem XLSX nem coluna de foto (DT-028) | Importador limitado |
| C3 | Sem rota para ordenar produtos dentro de uma seção | Ordem fixa |
| C4 | `GET /stores/mine` sem a lista de permissões do funcionário | Tela mostra "sem acesso" só após o 403 |
| C5 | Moderação do admin (`/admin/products`, `/moderation`, `/moderation/terms`) não testada contra a API real | QA valida na Onda 2 |
