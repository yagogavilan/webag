---
name: analise-de-concorrentes-e-referencias
description: Método para fazer engenharia reversa de contas, campanhas e posts de concorrentes e de referências do varejo local, extraindo padrões (gancho, formato, ritmo, CTA, objeções) sem copiar, com rótulo Observado/Inferido/Não encontrado. Use ao montar ou atualizar docs/marketing/referencias.md ou ao buscar o padrão por trás de um post que funcionou.
---

# Análise de concorrentes e referências

Objetivo: descobrir **o que se repete nas peças que funcionam** e **onde a concorrência é fraca**, para gerar hipóteses próprias. Nunca para copiar peça. Complementa `estrategia-social` §7 (que só manda fazer) com o método.

## 1. Defina o conjunto (10 a 20 contas, em 3 grupos)
| Grupo | Exemplos | Para que serve |
|---|---|---|
| Diretos | iFood, Rappi, Shopee, Zé Delivery e similares (ver `docs/produto/posicionamento.md` §2) | Promessa, tom, o que já está saturado |
| Alternativa real | o "WhatsApp da loja", perfis de lojas de bairro, vitrines no Instagram | A concorrência de verdade do lojista e do cliente local |
| Referência de formato | marcas de varejo/delivery com bom engajamento e peças autênticas | Padrões de gancho e ritmo |
Prefira contas com muitas peças (500+ posts se possível) para ver o que **repete**, não o acaso.

## 2. O que coletar por peça (planilha ou tabela)
Data; formato e duração; **gancho** (primeiro quadro, primeira fala, texto); estrutura (ordem de cenas); texto na tela; CTA; frequência da conta; sinais de resposta (curtidas, comentários, salvamentos, compartilhamentos **relativos ao tamanho da conta**, não valor absoluto); leitura dos comentários: perguntas, objeções, palavras que o cliente usa.

## 3. Compare dentro da conta
Separe as **melhores e piores** peças da mesma conta nos últimos 90 dias: o que as melhores têm que as piores não têm (formato, gancho, pessoa, tela do produto, tema)? Comparar contas diferentes mistura público e orçamento; compare como contexto, não como prova.

## 4. Rótulos obrigatórios e honestidade de fonte
- **Observado:** visto na peça ou em dado público (link, data de consulta).
- **Inferido:** conclusão sua; marque `[HIPÓTESE]` e diga como testar.
- **Não encontrado:** procurou e não achou (também é informação).
Relato de agência ou blog sem metodologia é `[HIPÓTESE]`. A rede da sessão pode bloquear domínios (já ocorreu): registre o que não abriu e **não** preencha lacuna com palpite. Biblioteca pública de anúncios (ex.: Biblioteca de Anúncios da Meta) mostra o que está rodando, não o desempenho.

## 5. Limites éticos e do Webag
Estude empresas, não pessoas. Só material público; **sem criar conta falsa, sem interagir, sem pedir dado**. Peça de terceiro não entra em material do Webag (nem recorte). Não faça afirmação sobre concorrente nominal sem fonte e data (risco de publicidade comparativa: dúvida jurídica vai ao fundador). Nenhum gasto: ferramenta de monitoramento paga só com autorização.

## 6. Do padrão à hipótese (saída útil)
Para cada padrão, uma linha em `docs/marketing/referencias.md`:
`link | data | padrão extraído | por que (provável) funciona | transfere ao Webag? | o que NÃO transfere (orçamento, cupom, mascote, escala) | hipótese testável | rótulo`.
Depois, uma **hipótese de teste** no formato da skill `teste-ab-de-criativos` (ex.: "abrir com a situação do lojista em vez da tela aumenta a retenção em 3 s"). Ranqueie por: evidência, aderência às travas, esforço e chance de diferenciar. Termine com **três** apostas, não vinte.

## 7. Atualização
Refaça o conjunto a cada trimestre ou quando um concorrente mudar de promessa. Padrão que parou de aparecer sai da lista. Guarde o histórico: mudar de padrão é sinal tão útil quanto o padrão.

## Fontes e licença
- coreyhaines31/marketingskills, skill `reverse-engineer-marketing` (MIT, Corey Haines, 2025), consultada em 2026-11-22. Adaptado: estudar histórico e não só foto do momento, rótulos Observado/Inferido/Não encontrado, comparar melhores e piores da mesma conta, "o que não transfere", gerar jogadas ranqueadas. **Descartado:** assinar serviços, abrir conta ou ligar para vendas em nome do time, análise de tráfego por ferramentas pagas, DNS e sinais ocultos.
- Pesquisa anterior do time: `docs/marketing/video-roteiro.md` §2 e `docs/produto/posicionamento.md` §2.
