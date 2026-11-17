# ADR-001: Stack de referência do Webag

- **Status:** Proposta (validar no kickoff)
- **Data:** a definir no kickoff
- **Autor:** CEO (com base no plano de arquitetura anterior)
- **Revisores:** backend-dev, mobile-dev, security-engineer

## Contexto
O Webag precisa sair em Android e iOS com equipe enxuta (o fundador + agentes), custo baixo de infra e um plano de back-end já desenhado em NestJS + PostGIS + Redis + PIX Mercado Pago + WebSocket. O fundador é web developer, então TypeScript ponta a ponta reduz troca de contexto.

## Opções consideradas
| Opção | Prós | Contras |
|---|---|---|
| **React Native + Expo** | Um código para Android/iOS; TypeScript igual ao back-end; EAS facilita build e publicação sem Mac próprio; atualizações OTA | Algumas libs nativas exigem dev build; performance abaixo do nativo em telas muito pesadas |
| Flutter | Ótima performance e UI consistente | Dart (nova linguagem); não compartilha tipos com o NestJS |
| Nativo (Kotlin + Swift) | Máxima performance | Dois códigos, dois especialistas, custo dobrado |
| PWA | Mais barato | Push e presença na App Store limitados; pior percepção de confiança |

## Decisão proposta
React Native + Expo no mobile; NestJS + PostgreSQL/PostGIS + Redis no back-end; monorepo com pacote `shared` de tipos e schemas.

## Consequências
- Positivas: um time de front cobre as duas lojas; contratos de API tipados de ponta a ponta.
- Negativas: depende do ciclo de SDK do Expo; publicar na App Store exige conta Apple Developer (paga) do fundador.
- Reavaliar se: houver requisito nativo pesado (ex.: rastreamento de entregador em segundo plano em tempo real) que o Expo não atenda bem.
