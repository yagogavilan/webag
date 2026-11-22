# Tela: Aviso de transparência e opt-out da medição (cliente e lojista)   (WB-360, WB-369; apoia WB-361)

> Autor: product-designer. Data: 2026-11-22. Release R5 (o aviso entra **antes** da coleta; em R1 só em staging). Protótipo: `v1-1-logistica-e-analises.html#/c/aviso` (folha do 1º uso), `#/c/privacidade` (interruptor e explicação), "Como medimos" em `#/l/analises`.
> Texto jurídico final é de Security e do encarregado (J24); abaixo, o texto **de interface**, em linguagem simples.

## 0. Decisões de UX

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Folha curta no 1º uso após a atualização**, não bloqueia a navegação: "Ajudar o Webag a melhorar. Medimos quais telas são abertas para melhorar o app. Não sabemos quem você é e a loja nunca vê quem visitou. Você pode desligar quando quiser." Botões: **Entendi** e **Ajustar em Privacidade** | WB-360 C1. Aviso que trava vira "aceitar sem ler" |
| 2 | **Opt-out em 1 toque** em Conta > Privacidade ("Ajudar o Webag a melhorar"), ligado por padrão | WB-360 C2. Opt-in seria mais prudente juridicamente, mas custa cobertura e viés (F7); decisão de Security e fundador |
| 3 | **A tela diz o que já foi enviado**: "Pronto. Não enviamos mais nada a partir de agora. O que já foi enviado é anônimo e não dá para apagar por conta, porque não está ligado a você." | WB-360 C3 / RN-A4: honestidade sobre o limite |
| 4 | **Três perguntas respondidas na tela**: O que medimos / O que nunca medimos / Por quanto tempo (90 dias brutos, depois só totais) | Transparência concreta, não política em PDF |
| 5 | **Sem conexão o interruptor funciona igual** ("Sem conexão: a escolha vale do mesmo jeito.") | WB-360 C4 |
| 6 | **Lojista**: tag "Medição anônima" + "Como medimos" dentro de Análises, com 3 pontos: contamos visitas, não pessoas; números menores que 5 ficam escondidos; quem desliga a medição não entra na conta (por isso alguns pedidos aparecem "sem medição") | Evita o lojista achar que há rastreio pessoal e explica a diferença entre vendas e funil |
| 7 | **O app do lojista e do admin não coletam** (a coleta é só do app do cliente e não ocorre com conta de loja ou admin) | PRD (pergunta ao designer): o lojista não precisa do opt-out |

## 1. Textos

| Elemento | Texto |
|---|---|
| Interruptor | "Ajudar o Webag a melhorar" / "Contamos quais telas são abertas, sem saber quem você é." |
| O que medimos | "Que telas e lojas são abertas, de onde você veio (banner, busca, home) e se terminou o pedido." |
| O que nunca medimos | "Seu nome, telefone, e-mail, endereço, o que você digita na busca, sua localização ou o aparelho. A loja nunca vê quem visitou." |
| Por quanto tempo | "Os dados brutos ficam 90 dias. Depois ficam só os totais." |
| Exportar meus dados (WB-369 C1) | "A medição de uso é anônima e não está ligada à sua conta, por isso não entra neste arquivo." |
| Pedido de oposição (WB-369 C3) | Canal do titular orienta o interruptor e registra o atendimento (sem tela nova) |

## 2. Estados

Interruptor ligado, desligado, sem conexão, **carregando** (a leitura da preferência é local, sem estado de carga), erro (se falhar ao salvar localmente: "Não conseguimos salvar sua escolha. Tente de novo."). Excluir conta: nada de analytics a apagar (não há ligação).

## 3. Acessibilidade

Interruptor `role="switch"` com rótulo e estado lido; folha com foco no título, `Esc` e "Entendi" fecham, foco volta; texto >= 16 px, escala 200%; alvo 52 px.

## 4. Eventos

Nenhum evento de medição é enviado ao desligar (a promessa é "nada mais a partir de agora"). `privacy_notice_seen` só conta se a medição estiver ligada. A taxa de opt-out não pode vir de evento: ver TM-1 e a pergunta 3.

## 5. Mapa WB

| História | Onde |
|---|---|
| WB-360 C1 a C5 | §0.1 a §0.5 (C5 política: texto do jurídico) |
| WB-369 C1 a C3 | §1 |
| WB-361 | Sem tela própria; depende deste aviso |

## 6. Revisão heurística

**Nota 4 de 5.** TM-1 (sev. 3, H1): a taxa de opt-out é a única medida de confiança e não pode ser medida pelo próprio evento (desligar interrompe o envio); medir por contagem local enviada **antes** de desligar viola a promessa; alternativa: estimar pela diferença de sessões do servidor x acessos. Pergunta ao backend. TM-2 (sev. 2, H8): "Ajudar o Webag a melhorar" é amigável mas vago; o apoio "contamos quais telas são abertas" resolve. Bom: escolha em 1 toque, diz o limite do que se apaga, sem trava. **Teste:** 5 clientes leem a folha e dizem o que é medido.

## 7. Perguntas

Security/encarregado: 1. Opt-out ou opt-in (F7) 2. Texto final e base legal 3. Como medir o opt-out sem violar a promessa. PO: 4. O aviso aparece em 1 vez só ou a cada versão da política?
