# Roteiro de usabilidade do cadastro rápido (WB-379 C3, HIP-Q1 e HIP-Q2)

Dono: qa-engineer | Criado: 2026-11-22 | Origem: `docs/produto/prd/v1-1-cadastro-rapido.md` (Objetivo, "Teste de usabilidade") | Quem aplica: o fundador, com aparelho real (o QA não tem aparelho) | Resultado vai para `docs/produto/pesquisa-mercado.md` §8 como HIP-Q1 (WB-379 C4)

`[HIPÓTESE]` Tudo aqui depende de aparelho, câmera, 4G e lojista de verdade: não foi executado. O servidor já grava o tempo (`product_create_started`, `photo_captured`, `product_create_published`; mediana e p90 por `via` no painel do admin, mínimo de 5 cadastros), mas o cronômetro do teste é manual: o evento mede o cadastro contínuo, não a dúvida do lojista.

## Quem, onde, como
| Item | Regra |
|---|---|
| Participantes | 5 pessoas do perfil P2 (lojista de bairro) ou parentes de lojistas, **sem vínculo com o fundador** |
| Aparelho e rede | Android de entrada (2 a 3 GB) e, em 1 ou 2 sessões, iPhone; 4G normal e 1 rodada em 3G simulado (modo avião intermitente) |
| Ambiente | Staging com o provedor `fake` e a loja do participante já aprovada (nada de produção); flag `medicao_padrao_ligada` ligada só no staging |
| Condução | Sem demonstração e sem ajuda; quem conduz só cronometra, conta toques errados e anota as frases de dúvida; parar quando as dificuldades se repetirem |

## As 5 tarefas
| # | Tarefa | Meta `[HIPÓTESE]` | Medir |
|---|---|---|---|
| 1 | Cadastrar 1 produto que está na mão (foto, nome, preço) | mediana <= 60 s, p90 <= 90 s (da 3ª tentativa) | segundos do toque em "Novo produto" até "Publicado"; toques errados; telas de erro |
| 2 | Produto com 3 tamanhos x 2 cores, com estoque | mediana <= 120 s | segundos; erros na grade |
| 3 | Duplicar o produto da tarefa 1 para outra cor | <= 30 s `[HIPÓTESE]` | segundos; se achou "Duplicar" sozinho |
| 4 | Subir o preço de 5 produtos em 10% | <= 60 s `[HIPÓTESE]` | segundos; se leu a prévia; se tentou desfazer |
| 5 | Colar uma lista do WhatsApp com 6 itens | <= 3 min `[HIPÓTESE]` | linhas lidas certas sem toque; linhas "Confira" aceitas sem mudar; linhas corrigidas depois de publicadas (HIP-Q2) |

Cada tarefa tem 3 tentativas; o número que vale é o da 3ª.

## Critério de morte (PRD)
Mediana da 3ª tentativa **> 120 s** na tarefa 1 **ou** 3 de 5 participantes **pedirem ajuda**: o cadastro rápido não cumpriu a promessa e volta ao PO e ao designer antes de qualquer lançamento.

## O que o QA entrega depois
1. Planilha com os tempos por pessoa, tarefa e tentativa; toques errados; frases de dúvida literais.
2. Conferência cruzada: mediana e p90 do painel do admin (WB-379 C2) x cronômetro manual; se divergirem mais de 15 s, investigar o evento.
3. Parecer: atingiu, não atingiu ou inconclusivo (menos de 5 cadastros por via não gera percentil).

## Roteiro curto de aparelho para o fundador (pré-requisito do teste)
| Passo | Esperado |
|---|---|
| Abrir "Novo produto" no Android de entrada e negar a câmera | abre a galeria e explica como liberar a câmera (WB-370 C7) |
| Tirar a foto, digitar nome e preço, tocar "Publicar" | "Publicado" com "Cadastrar outro" e "Duplicar" |
| Tocar "Publicar" duas vezes seguidas | um produto só |
| Ligar o modo avião e tocar "Publicar" | botão inerte com "Sem internet. O que você digitou fica neste aparelho..." (WB-370 C8); ao voltar a rede e tocar de novo, publica uma vez |
| Fechar o navegador no meio do cadastro e voltar | "Continuar: <nome>" no topo da lista de produtos (WB-371 C1) |
| Tocar em "Novo produto", desistir da câmera e tentar apagar o rascunho | **hoje falha com erro** (BUG-036): anotar o que o lojista vê |
