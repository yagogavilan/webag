---
name: avaliar-post
description: Rubrica para avaliar posts, carrosséis, vídeos curtos e apresentações de venda do Webag antes de publicar (nota, veredito, o que mudar) e para ler métricas depois de publicar. Use em toda revisão de peça de divulgação e em retrospectivas de desempenho.
---

# Avaliar peça de divulgação (antes e depois de publicar)

Julga **atenção e ação primeiro**, marca e render depois. Marca/render certos com ideia fraca é reprovação.

## Como olhar a peça
- **Imagem/post:** abra o arquivo (Read) e olhe também **em miniatura** (≈ 360 px de largura, como no feed).
- **Vídeo:** extraia quadros com ffmpeg (`-ss`, 1 quadro por 0,5 s e todos os quadros em torno de cada corte) e monte uma folha de contato; assista por ritmo, não só por quadro. Procure quadros vazios, texto pequeno, cortes moles.
- **Apresentação:** passe cada slide a 3 segundos; depois leia a sequência como o dono da loja na porta.

## Rubrica (0 a 5 em cada; nota final = média ponderada)
| Critério | Peso | 5 significa |
|---|---|---|
| **Gancho em 1 segundo** | 25% | Em ≤1 s (vídeo) ou na 1ª olhada (feed) o público sente algo e quer ver mais |
| **Uma ideia clara** | 15% | Uma frase resume a peça; um público; uma ação |
| **Relevância/identificação** | 15% | "É pra mim": cena ou dor específica, na voz do público |
| **Prova do produto** | 15% | Produto real em uso, grande e legível (UI ≥ 24 px na peça) |
| **Leitura em miniatura e sem som** | 10% | Entende no feed pequeno e mudo |
| **Ação (CTA)** | 10% | Um único próximo passo, fácil e visível |
| **Autenticidade (não parece IA/template)** | 10% | Específico, humano, sem clichê; composição própria, não molde com a cor trocada |

**Regra de corte:** nota final < 4,0 volta para refação com feedback específico. Qualquer critério ≤ 2 também volta.

## Travas do Webag (qualquer uma reprova, independente da nota)
1. Pagamento (PIX/cartão/Mercado Pago) como argumento ou título.
2. Prazo de entrega ("2 h", "em minutos"), superlativo, depoimento ou número sem fonte.
3. "Compre de quem é daqui"/regional como mensagem (DEC-040); a região só como escopo de lançamento.
4. Emoji, degradê, mascote, imagem gerada por IA, rosto sintético.
5. Dado pessoal, credencial, código de pedido real ou horário de demonstração visível na captura de tela.
6. Promessa dependente de parecer jurídico (entrega/motoboy, J8) sem marcação em `docs/marketing/pendencias.md`.

## Perguntas de teste (responda por escrito)
- O que a pessoa **sente em 1 segundo**? (uma palavra)
- Qual é a **única ação** que ela faz depois?
- Se tirássemos o logo, de quem seria a peça? (se de qualquer um, falta especificidade)
- O que um concorrente não poderia dizer?
- Por que ela **não** passaria o dedo?

## Formato do parecer (curto)
```
Peça: <arquivo> | Público: <cliente|lojista> | Nota: X,X/5 | Veredito: PUBLICAR | AJUSTAR | REFAZER
Sente em 1 s: <palavra> | Ação: <uma> | Travas: <nenhuma|quais>
Notas por critério: gancho X · ideia X · identificação X · prova X · miniatura X · CTA X · autenticidade X
Faça: <3 mudanças concretas, ordem de impacto, com o que escrever/mostrar>
Teste A/B sugerido: <duas versões e métrica>
```

## Depois de publicar (métricas e aprendizado)
| Objetivo | Métricas principais |
|---|---|
| Alcance | alcance, impressões, crescimento de seguidores |
| Atenção | retenção/tempo assistido, taxa de saída nos 3 primeiros segundos, "skip rate" de Stories/Reels |
| Interesse | salvamentos e compartilhamentos (valem mais que curtidas), comentários |
| Ação | cliques no link da bio, visitas ao perfil, mensagens diretas, cadastros na lista/de lojistas |
Revisão semanal: 3 melhores e 3 piores, o que têm em comum (gancho, formato, horário, público); decidir o que repetir, cortar e testar. Se o engajamento cai: teste gancho, horário e formato; se o alcance cai: mais vídeo, sem link no corpo, publicar com mais regularidade. Para lojista: conte **lojas cadastradas e ativadas por peça**, não curtidas.
Nenhuma meta de viralização é prometida: viralizar é consequência medida, não plano.

## Referências
- `coreyhaines31/marketingskills`, skill `social` (MIT, 2025): métricas e revisão semanal.
- Docs do Webag: `docs/marketing/direcao-criativa.md`, `docs/produto/posicionamento.md` §7.
