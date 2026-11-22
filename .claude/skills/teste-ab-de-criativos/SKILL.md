---
name: teste-ab-de-criativos
description: Testar variações de gancho, formato e mensagem com conta pequena: hipótese, uma variável, métrica, regra de parada e leitura honesta de resultado direcional (sem falsa significância). Use ao comparar duas versões de uma peça, ao decidir o que repetir ou cortar depois de publicar ou ao testar aberturas da apresentação porta a porta.
---

# Teste A/B de criativos (para conta pequena)

Realidade: o Webag está começando; alcance por peça é de centenas, não de dezenas de milhares. Teste estatístico clássico **não é viável** para diferenças pequenas. Ordem de valor: ideia nova, depois ideia forte, **depois** microajuste. Por isso: teste **diferenças grandes** (gancho, ângulo), aceite resultado **direcional** e **repita** antes de concluir.

## 1. Ficha do experimento (uma por teste, em `docs/marketing/avaliacoes/`)
| Campo | Conteúdo |
|---|---|
| Observação | o que motivou ("nossos Reels abrem com a tela e 70% saem em 3 s", dado real da conta) |
| Hipótese | "Se abrirmos com a situação do lojista (A) em vez da tela (B), a taxa de saída em 3 s cai, para o público lojista" |
| **Uma** variável | só o gancho; mesma ideia, duração, CTA, legenda, arte |
| Público/canal | mesmo perfil, mesmo formato (Reel com Reel; Story com Story) |
| Métrica principal | ligada ao objetivo (tabela seção 2) |
| Guarda-corpo | o que não pode piorar (comentários negativos, perda de seguidores, DMs de lojista) |
| Regra de parada | até quantas publicações/dias; não olhar no meio para decidir |
| Decisão pré-combinada | "se A superar B em >= X nas 2 rodadas, adotamos A" |

## 2. Métrica por objetivo
| Objetivo | Métrica principal | De apoio |
|---|---|---|
| Alcance/gancho (vídeo) | taxa de saída em 3 s e retenção média | visualizações, tempo assistido |
| Recrutar lojista | **DMs/mensagens de lojista e cadastros iniciados** | salvamentos, compartilhamentos |
| Lista de espera | cliques no link/QR e inscritos | seguidores novos qualificados |
Curtida é métrica de vaidade; ação (mensagem, inscrição, retorno da loja) vale mais. Métricas do app/perfil: ver `avaliar-post` ("Depois de publicar").

## 3. Como rodar com pouco alcance
- **Publicação alternada** (A numa terça, B na terça seguinte, mesmo horário e dia da semana) ou duas contas/públicos equivalentes; evite A no fim de semana e B no meio da semana.
- **Mesmo teste 2 ou 3 vezes** com ideias iguais e execução diferente; um único resultado é anedota.
- **Tamanho de efeito:** só tome decisão se a diferença for grande e consistente. Referência de rigor (Corey Haines): com 3% de base e 20% de melhoria relativa, são ~14 mil visitantes por variante; com 1% e 10%, ~160 mil. Você não tem isso: por isso resultado pequeno = **empate**, não vitória.
- **Gatilho:** compare quem **viu** o gancho (alcance), não só quem clicou (o gancho muda quem clica).
- Não pare quando "parecer" ganhar nem estenda até ganhar. Não corte o público depois para achar um vencedor; segmento achado depois é só pista para novo teste.
- Anúncio pago para teste: apenas **recomende** com custo estimado; gasto só com o fundador.

## 4. Porta a porta e WhatsApp (muitas vezes o melhor laboratório)
Alterne duas aberturas da apresentação ou da primeira mensagem por visita (ímpar/par). Registre por visita: versão, tipo de loja, reação nos 30 s, retorno depois de 3 dias, cadastro. Amostra pequena: use para **aprender objeções**, não para provar causa.

## 5. Leitura e registro (tabela de aprendizados)
`data | hipótese | versões | resultado (números reais) | decisão | confiança (baixa/média/alta) | status (ativo / observar / aposentado)`. Só entra regra permanente depois de **2 repetições**. Aprendizado que contraria uma trava do Webag não se aplica (as travas valem para as duas versões, A e B).

## 6. Erros comuns
Mudar gancho e arte e CTA juntos; comparar Story com Reel; olhar só o melhor número; chamar de "viral" um pico de 1 dia; testar o que o público não vê (rodapé); tirar conclusão com 1 peça; ignorar a causa externa (feriado, notícia, post de outro perfil).

## Fontes e licença
- coreyhaines31/marketingskills, skill `ab-testing` (antes `ab-test-setup`) (MIT, Corey Haines, 2025), consultada em 2026-11-22. Adaptado: formato de hipótese, uma variável, métrica principal e guarda-corpo, regra de parada, não espiar, gatilho de análise, valores de referência de amostra (citados acima), tabela de aprendizados. Reescrito para conta pequena, Instagram e visita presencial.
- As alternativas para pouca audiência (alternar publicações, repetir testes) são recomendação do autor `[HIPÓTESE]`; validar com os resultados reais da conta.
