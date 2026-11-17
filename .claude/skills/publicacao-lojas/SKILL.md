---
name: publicacao-lojas
description: Checklist de publicação do Webag na Google Play e na App Store (contas, requisitos, assets, privacidade, motivos comuns de rejeição). Use ao preparar o gate G5 ou planejar o lançamento.
---

> Requisitos das lojas mudam. Antes do G5, confirme os itens nas páginas oficiais (Google Play Console Help e App Store Review Guidelines) e anote a data da checagem.

# Contas e acessos (dependem do fundador)
- [ ] Google Play Console (conta de desenvolvedor; para conta pessoal nova, a Google exige período de teste fechado com testadores antes da produção — confirmar regra vigente)
- [ ] Apple Developer Program (anuidade paga; conta de organização exige CNPJ e D-U-N-S)
- [ ] Expo/EAS com credenciais de assinatura geridas pelo EAS
- [ ] Domínio com página de política de privacidade, termos e suporte

# Requisitos comuns às duas lojas
- [ ] Política de privacidade acessível por URL e dentro do app
- [ ] Exclusão de conta iniciada dentro do app (e via web para a Google)
- [ ] Formulários de privacidade (Data Safety / App Privacy) coerentes com o que o app realmente coleta
- [ ] Conta de teste para o revisor (cliente e lojista) com dados de demonstração e instruções
- [ ] Nenhuma funcionalidade "em breve", tela vazia ou link quebrado
- [ ] Classificação etária preenchida

# Assets
- [ ] Ícone (1024×1024 sem transparência para iOS; 512×512 para Google Play)
- [ ] Feature graphic Google Play (1024×500)
- [ ] Screenshots de telefone nas resoluções exigidas por cada loja (iPhone em pelo menos o tamanho de tela atualmente obrigatório)
- [ ] Nome, subtítulo/descrição curta, descrição completa, palavras-chave (iOS), categoria (Compras)

# Motivos frequentes de rejeição
- Login obrigatório antes de mostrar qualquer valor (deixe navegar no catálogo sem conta, se possível)
- Falta de conta demo ou demo que não funciona
- Permissão pedida sem explicação clara de uso
- Metadados prometendo o que o app não faz
- Crash na revisão (testar o build exato enviado)
- Pagamento: bens físicos podem usar meio de pagamento próprio (PIX/MP) — não usar compra in-app da Apple/Google para produtos físicos

# Ordem recomendada
1. Teste interno (EAS preview / TestFlight / Play teste interno) com o fundador e lojistas piloto
2. Teste fechado com consumidores reais da região
3. Correção de bugs Crítica/Alta → G4
4. Envio para revisão → G5 → lançamento gradual (Play: rollout por %; iOS: phased release)
