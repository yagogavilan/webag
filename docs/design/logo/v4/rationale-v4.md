# Logo Webag v4: corrigindo "sacola que parece cadeado"

> Autor: product-designer. Data: 2026-11-19. **[NÃO VERIFICADO]** SVGs escritos à mão, sem render. Comportamento a 16/24 px abaixo é **estimativa geométrica**; o CEO renderiza e confirma. Mantido da v3: `#C02EF0` sólido, sem gradiente, 3 barras, viewBox `0 0 160 104`, traço 14.

## 1. Diagnóstico (concordo com o fundador)
A v3 era corpo retangular simétrico (96x70, rx18) + alça em U estreita e centrada: a silhueta exata de um cadeado. O que separa sacola de cadeado: **corpo que afunila**, **alça larga que sai perto dos cantos** (não do centro), **olhais** e **assimetria**.

## 2. O que as variantes mudam
Todas compartilham a base nova: corpo em **trapézio** (topo 96, base ~80, cantos raio 9, lados assimétricos: esquerdo quase reto, direito inclinado, o que dá a inclinação para a frente sem virar paralelogramo) e alça **mais baixa** (apice externo y 1 a 7, contra 0 na v3 com perna reta).

| | Estratégia | Alça | Detalhe | Risco |
|---|---|---|---|---|
| **v4a Trapézio** | trapézio + alça larga/baixa + **olhais** | 1 arco 52x30 no eixo, **69%** do topo do corpo | 2 furos r 4,5 sob as pernas, em espaço negativo | Sozinho o trapézio é sutil; os olhais somem abaixo de ~32 px (aceitável: o resto da leitura continua) |
| **v4b Alça dupla** | trapézio + **duas alças** cruzadas (frente baixa, trás alta) com vão de 4 | 2 arcos, 75% do topo | O vão do cruzamento é espaço negativo | É o sinal mais forte de "sacola" e o mais longe de cadeado (cadeado tem 1 haste), mas é o mais cheio: vãos de 4 unidades |
| **v4c Dobra + w** | trapézio + alça de v4a + **aba diagonal** (faixa negativa 5) + **"w" negativo** (traço 8) | 1 arco, 69% | Reforça a marca com o w | **Maleta/pasta**: faixa no topo + alça lembra pasta executiva. O w tem traço fino e morre abaixo de ~48 px |

## 3. Comportamento estimado (16 px = altura do símbolo, escala 0,154; 24 px = escala 0,23)

| | 16 px | 24 px |
|---|---|---|
| v4a | traço 2,2 px; trapézio + arco + 3 barras legíveis; olhais (0,7 px) viram ruído leve; alça vazada ~5x2 px | tudo legível; olhais ~1 px, começam a aparecer |
| v4b | as duas alças fundem num arco grosso e largo (vãos de 0,6 px): lê como **uma alça larga**, ainda sacola, mas perde o "duplo" | vão de ~0,9 px, lê como duas alças se o render for nítido; instável em tela de baixa densidade |
| v4c | w ilegível (1,2 px), a faixa vira uma linha clara irregular que pode sujar o corpo; lê como corpo trapézio com alça | w legível como textura, faixa visível |

Para 16 px o favicon já traz a versão reduzida (sem olhais, 2 barras): `webag-favicon-v4.src.svg`.

## 4. Recomendação: **v4a Trapézio**
1. É a que **melhor falha**: a 16 px perde só o detalhe dos olhais e mantém trapézio + alça larga + barras. v4b e v4c dependem de vãos finos.
2. Traz de volta exatamente o que fez a logo do fundador não parecer cadeado (trapézio, alça saindo de olhais), em formas primitivas e traço único.
3. Mudar menos preserva o patrimônio da v3 (barras, cor, linguagem monoline).
4. Crítica honesta: se, no render, a v4a ainda ler "cadeado" (a alça é grossa e arqueada), o plano B é **v4b**, não v4c. v4c só se o fundador quiser o w e aceitar o risco de pasta.

## 5. Arquivos
`webag-simbolo-v4a/b/c.svg` (prontos, sem texto) · da v4a: `webag-logo-v4.src.svg` (palavra `#A21FBE`), `webag-logo-branca-v4.src.svg`, `webag-icone-app-v4.src.svg` (1024, símbolo a escala 3,2), `webag-favicon-v4.src.svg` (32x32).

## 6. Para o CEO
1. Converter TEXT2PATH nos 2 logos e renderizar: v4a/b/c lado a lado a 16, 24, 48 e 160 px, sobre branco e `#C02EF0`; ícone com guias ligadas; favicon a 16/32.
2. **Teste de cobrir a palavra** com 5 pessoas: "é o quê?". Se mais de 1 disser cadeado/maleta, escolher a próxima variante.
3. O símbolo v4a termina em x=154 (v3 ia a ~167): o vão até a palavra (x=182) ficou 28 em vez de ~15. Avaliar subir `x` para ~170 após ver a render.
4. As máscaras (`mask`) exigem que o conversor/rasterizador as suporte (resvg suporta); se não, avisar e eu troco por `path` evenodd.
5. Como a mudança é de símbolo, a nota de uso da v3 §5.2 continua valendo (respiro 2t, mínimo 24 px, branca sobre roxo).
