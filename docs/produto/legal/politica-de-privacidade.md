# Política de Privacidade (PROPOSTA para revisão do advogado)

Metadados (NÃO publicar; o web e o seed consomem só o trecho entre os marcadores):

| Campo | Valor |
|---|---|
| Status | **PROPOSTA do PO, não aprovada pelo jurídico.** Não é parecer nem afirma conformidade com a LGPD. Enquanto não houver aprovação, a página pública mostra "versão para revisão" (DEC-078, DEC-080) |
| Dono | product-owner; revisão: advogado do fundador e encarregado (J1 a J16 e J17 a J21 em `LEIA-ME.md`) |
| Data da proposta | 2026-11-20 |
| Tipo no sistema | `privacy` (`legal_documents`, versão imutável; mudança relevante exige novo aceite, WB-210 C3) |
| Baseado em | `docs/seguranca/inventario-lojas.md` (conferido contra o RC `f622bc9`), `apps/api/src/modules/privacy/privacy-map.ts`, `docs/seguranca/runbook-dsr.md`, `docs/produto/prd/lgpd.md`, DEC-050, DEC-056, DEC-063, DEC-072, `regras-de-negocio.md` RN-14 |
| Variáveis | `{{COMPANY_NAME}}`, `{{COMPANY_CNPJ}}`, `{{COMPANY_ADDRESS}}`, `{{DPO_NAME}}`, `{{DPO_EMAIL}}`, `{{SUPPORT_EMAIL}}`, `{{SITE_URL}}`, `{{VIGENCIA}}`, `{{VERSAO}}`, `{{HOSTING_PROVIDER}}`, `{{EMAIL_PROVIDER}}`, `{{MP_LEGAL_NAME}}` |
| Marcador de revisão | `[REVISAR JURÍDICO Jn]` inline; remover todos antes de publicar. Lista consolidada no fim deste arquivo |

<!-- TEXTO-PUBLICO-INICIO -->

## 1. Resumo em linguagem simples

Esta política explica quais dados pessoais o Webag usa, por quê, com quem os compartilha, por quanto tempo os guarda e como você pode controlá-los. Em resumo:

- Pedimos só o que é preciso para você comprar e receber: nome, e-mail, celular e, para entrega, o endereço.
- Não vemos nem guardamos os dados do seu cartão. O pagamento é feito no Mercado Pago.
- A loja onde você compra e o entregador que leva o pedido recebem só o necessário para entregar, e só enquanto o pedido está em andamento.
- Não vendemos os seus dados e não usamos serviços de publicidade nem rastreamos você em outros aplicativos.
- Marketing (avisos de promoção) só com o seu consentimento, que você pode retirar quando quiser.
- Você pode ver, exportar, corrigir e excluir os seus dados pelo app ou pelo site, sem precisar do suporte.
- Para falar com a pessoa responsável pela proteção de dados: {{DPO_EMAIL}}.

## 2. Quem é o responsável pelos seus dados

A controladora dos dados é {{COMPANY_NAME}}, inscrita no CNPJ {{COMPANY_CNPJ}}, com sede em {{COMPANY_ADDRESS}}, que opera o Webag (aplicativo, site e painéis). Neste texto, "Webag", "nós" e "nosso" significam essa empresa. [REVISAR JURÍDICO J18: confirmar razão social, nome fantasia e endereço.]

O encarregado pelo tratamento de dados pessoais (o canal entre você, o Webag e a ANPD) é {{DPO_NAME}}, pelo e-mail {{DPO_EMAIL}}. [REVISAR JURÍDICO J18: quem será o encarregado e se a dispensa prevista para agentes de pequeno porte se aplica a um marketplace.]

A loja onde você compra também usa alguns dos seus dados, por conta própria, para entregar o pedido e emitir a nota fiscal. Nesse uso, a loja é responsável pelos dados e deve cumprir a lei (veja o item 5.1). [REVISAR JURÍDICO J12: papel de controladora própria da loja.]

Este texto vale para quem usa o app como cliente, para visitantes do site e para donos de loja e funcionários que usam o painel do lojista.

## 3. Quais dados coletamos

### 3.1 Dados que você nos informa

- Cadastro: nome, e-mail, celular e senha (a senha é guardada de forma irreversível, nunca em texto legível). Você também declara ter 18 anos ou mais.
- Endereço de entrega: CEP, rua, número, complemento, bairro, cidade e estado. A retirada na loja não pede endereço.
- CPF: não pedimos no cadastro. Só pedimos o CPF no pagamento quando o Mercado Pago exigir. Nesse caso, guardamos apenas uma "impressão" irreversível do número (um código que não permite recuperar o CPF), e o número em si fica cifrado por poucos minutos, só para concluir o pagamento.
- Trocas: fotos do defeito (câmera ou seletor de fotos do aparelho; retiramos dados de localização e outros metadados da imagem), o motivo e a descrição.
- Avaliações, respostas e denúncias: nota, texto, "como vestiu" e o texto de denúncias de conteúdo.
- Atendimento: o que você nos escreve pelo formulário, pelo suporte ou pelo canal do encarregado.
- Consentimentos: o que você aceitou ou recusou (por exemplo, avisos de promoção) e quando.

### 3.2 Dados gerados pelo uso

- Pedidos: itens, valores, forma de pagamento, status, datas, cancelamentos, "não recebi" e pedidos de troca.
- Buscas recentes, favoritos e sacola.
- Cupons pessoais (por exemplo, a compensação por atraso).
- Identificador aleatório do aparelho, gerado pelo app, usado na segurança da sessão e na prevenção a fraude (não é o identificador de publicidade).
- Token de notificações (push), para avisar sobre o pedido.
- Abertura de avisos de campanha, somente se você consentiu com marketing.
- Endereço de IP, data e hora e tipo de aparelho e de navegador de cada acesso (registro de acesso exigido por lei).
- Localização aproximada do aparelho, somente com o app aberto e se você permitir. Ela serve para mostrar lojas que entregam perto de você. O app arredonda a localização antes de usá-la, e a Webag não a guarda nos seus servidores.

### 3.3 Dados que vêm de terceiros

- Mercado Pago: o resultado do pagamento (aprovado, recusado, estornado) e o identificador da operação.
- ViaCEP (serviço público de consulta de CEP): devolve rua, bairro e cidade a partir do CEP que você digitar.
- A loja: confirmações do andamento do seu pedido (aceito, pronto, recusado).

### 3.4 Dados de quem tem loja no Webag

- Dono: nome, e-mail, celular, CPF ou CNPJ e razão social.
- Documentos para análise da loja: documento com foto, comprovante de endereço da loja, cartão CNPJ. Só a equipe autorizada do Webag acessa, por link temporário, e cada acesso é registrado.
- Dados da loja: endereço, horário de funcionamento, fotos, logotipo, catálogo.
- Conta de recebimento: a ligação com a conta do Mercado Pago, por meio de chaves de acesso guardadas cifradas.
- Funcionários: nome, e-mail e permissões, cadastrados pelo dono.
- Histórico de análise, aprovação, suspensão e bloqueio da loja.

### 3.5 O que não coletamos

Não coletamos dados do seu cartão, data de nascimento, contatos, agenda, SMS, áudio, arquivos do aparelho, dados de saúde, histórico de navegação, lista de aplicativos instalados, identificador de publicidade nem localização com o app fechado.

## 4. Para que usamos os dados e em que base legal

A lei exige que cada uso tenha uma justificativa, chamada de base legal (art. 7º da Lei 13.709/2018, a LGPD). Estas são as nossas:

- Criar e manter a sua conta, entrar no app e recuperar a senha. Base: execução do contrato, a pedido seu (art. 7º, V).
- Receber, pagar, entregar, acompanhar e, se preciso, trocar ou estornar o pedido. Base: execução do contrato (art. 7º, V).
- Avisar sobre o status do pedido (notificações e e-mails do pedido). Base: execução do contrato (art. 7º, V).
- Mostrar lojas que entregam perto de você com a localização aproximada. Base: o seu pedido para ver lojas por perto e a sua permissão no aparelho, que você pode negar ou retirar (art. 7º, I e V). Sem a permissão, você informa o CEP ou a cidade. [REVISAR JURÍDICO J10: base da localização.]
- Cumprir obrigações fiscais, contábeis e de guarda de registros de acesso. Base: obrigação legal (art. 7º, II).
- Prevenir fraude e abuso, como o uso do mesmo cupom de primeira compra em várias contas, usando telefone, endereço, aparelho e o código irreversível do CPF. Base: legítimo interesse do Webag, que avaliamos para não prejudicar seus direitos (art. 7º, IX). Você pode se opor (item 7). [REVISAR JURÍDICO J10: confirmar o legítimo interesse e o registro da avaliação.]
- Segurança da plataforma, registro de acesso e investigação de incidentes. Base: obrigação legal e legítimo interesse (art. 7º, II e IX; Marco Civil da Internet, art. 15).
- Guardar a prova de que você aceitou os termos e deu ou retirou consentimentos, e nos defender em disputas. Base: exercício regular de direitos e obrigação de provar o consentimento (art. 7º, VI; art. 8º, §2º). [REVISAR JURÍDICO J15: base e prazo.]
- Analisar trocas e atender reclamações (fotos e relatos). Base: execução do contrato e exercício regular de direitos (art. 7º, V e VI).
- Avaliações, denúncias e moderação de conteúdo. Base: execução do contrato e legítimo interesse (art. 7º, V e IX).
- "Buscas recentes" e favoritos. Base: legítimo interesse, e você pode apagar quando quiser (art. 7º, IX).
- Promoções e novidades por notificação ou e-mail. Base: o seu consentimento, separado e opcional (art. 7º, I). Recusar não impede o uso do app.
- Verificação e acompanhamento de lojas (documentos, aprovação, prevenção a fraude). Base: obrigação legal, execução de contrato com o lojista e legítimo interesse (art. 7º, II, V e IX). [REVISAR JURÍDICO J12.]

Não usamos os seus dados para publicidade de terceiros, não os vendemos e não fazemos perfis para decidir preço.

## 5. Com quem compartilhamos os dados

### 5.1 A loja onde você compra

Para preparar e entregar o pedido, a loja vê o seu nome e os itens. O seu telefone e o endereço de entrega ficam visíveis à loja só enquanto o pedido está em andamento: quando o pedido é concluído, recusado, cancelado ou expirado, a loja deixa de vê-los. A loja nunca vê o seu e-mail, o seu CPF nem os seus outros endereços. Na retirada, a loja vê só o seu nome e o código de retirada.

A loja usa esses dados por conta própria para entregar o pedido e cumprir a obrigação fiscal dela, e assume por contrato o dever de usá-los só para isso (Termos do Lojista). [REVISAR JURÍDICO J12 e J10.]

### 5.2 Entregadores

A entrega é feita pelo Webag, por entregadores parceiros. Para a corrida, a operação envia a um entregador, por mensagem de WhatsApp, o nome da loja, os endereços de coleta e entrega, o seu primeiro nome, o seu telefone, os volumes e uma observação. Não enviamos CPF, e-mail, lista de itens, valores nem o código de entrega. A mensagem sai no momento em que o entregador é escolhido. O WhatsApp é um serviço da Meta e também processa a mensagem, conforme a política dele. Pedimos aos entregadores que usem os dados só para a corrida e os apaguem depois. [REVISAR JURÍDICO J10 e J8: base legal, papel do entregador, instruções e apagamento no aparelho dele.]

### 5.3 Mercado Pago

O pagamento é processado pelo Mercado Pago ({{MP_LEGAL_NAME}}). Ele recebe o seu e-mail, o valor do pedido e, quando exigido, o CPF. Os dados do cartão são digitados em página do próprio Mercado Pago, no navegador, e não passam pelos servidores do Webag. O Mercado Pago também usa os dados por conta própria, para segurança e conforme a política dele. [REVISAR JURÍDICO J10: papéis de operador e controlador.]

### 5.4 Prestadores de serviço do Webag

Contratamos empresas que tratam dados em nosso nome e só para nos prestar o serviço: hospedagem e armazenamento ({{HOSTING_PROVIDER}}); envio de e-mails ({{EMAIL_PROVIDER}}); notificações no celular (Expo, Google Firebase Cloud Messaging e Apple Push Notification service); e monitoramento de erros do servidor, configurado para não enviar dados pessoais. [REVISAR JURÍDICO J10: listar só os prestadores efetivamente contratados no lançamento.]

Também consultamos serviços de endereço: o ViaCEP (recebe o CEP e o IP do aparelho) e, se estiver ativado, um serviço de localização de endereços no servidor (recebe só rua, cidade e estado, sem número nem complemento). O aparelho pode usar o serviço de localização do próprio sistema (Apple ou Google) para achar o endereço digitado.

### 5.5 Autoridades e obrigações legais

Podemos compartilhar dados quando a lei ou uma ordem de autoridade competente exigir, e para defender os nossos direitos em processos.

### 5.6 O que não fazemos

Não vendemos dados pessoais, não os cedemos para publicidade e não os entregamos a lojas para marketing.

## 6. Por quanto tempo guardamos os dados

Guardamos só pelo tempo necessário. Os prazos abaixo são os padrões atuais da plataforma. [REVISAR JURÍDICO J15: prazos e bases de todo este item.]

- Conta (nome, e-mail, celular, endereços salvos, favoritos, buscas, preferências): enquanto a conta existir. Na exclusão, veja o item 8.
- Sacola: some sozinha em 7 dias sem uso.
- Pedidos, valores e pagamentos: 5 anos, para cumprir obrigações fiscais e contábeis. Depois da exclusão da conta, ficam sem identificação direta e o endereço do pedido é reduzido a cidade e estado.
- Código irreversível do CPF do pagador: junto com o pedido, pelo mesmo prazo.
- Contato do cliente na corrida de entrega (telefone e anotações): 7 dias depois da corrida.
- Fotos e relatos de troca: 180 dias depois de a troca terminar. Na exclusão da conta, são apagados.
- Avaliações: o texto é apagado na exclusão da conta e a nota fica somada à média da loja, sem ligação com você.
- Aparelho e sessões: até 30 dias depois de a sessão expirar. Token de notificação: até você sair da conta ou excluí-la.
- Códigos enviados por e-mail: 7 dias.
- Arquivo de exportação dos seus dados: o link vale por 7 dias.
- Registros de acesso (IP, data e hora): 6 meses, como manda o Marco Civil da Internet (art. 15).
- Prova de aceite dos termos e dos consentimentos: 5 anos, com o IP parcialmente ocultado depois da exclusão da conta. Depois disso, apagamos. [REVISAR JURÍDICO J15: prazo de 5 anos, prescrição, e se o IP truncado basta.]
- Histórico de bloqueio ou desbloqueio de conta: 5 anos, para prevenir fraude e provar o ato. [REVISAR JURÍDICO J15.]
- Pedidos do titular (protocolo e prazos): 5 anos, com os dados pessoais anonimizados. [REVISAR JURÍDICO J15.]
- Documentos de loja: enquanto a loja estiver ativa e por 5 anos depois (obrigação fiscal); documentos de loja reprovada, 90 dias.
- Chaves de acesso à conta do Mercado Pago de um dono de loja excluído: 120 dias (para estornos tardios) e depois são apagadas.
- Cópias de segurança (backup): o dado apagado some das cópias em até 30 dias, pela rotação normal. Se uma cópia antiga for restaurada, refazemos as exclusões já pedidas. [REVISAR JURÍDICO J15: prazo de backup citado na política.]

Alguns dados podem ficar além desses prazos se a lei exigir, se uma autoridade determinar ou para defesa em processo (LGPD, art. 16).

## 7. Seus direitos e como exercê-los

A LGPD (art. 18) garante a você:

- confirmar que tratamos seus dados e acessá-los;
- corrigir dados incompletos, inexatos ou desatualizados;
- pedir anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados fora da lei;
- pedir a portabilidade dos dados;
- pedir a eliminação dos dados tratados com o seu consentimento;
- saber com quem compartilhamos os dados;
- saber que pode não consentir e quais as consequências;
- retirar o consentimento a qualquer momento;
- se opor a um tratamento feito sem consentimento, quando entender que ele descumpre a lei;
- pedir a revisão de decisões tomadas só por tratamento automatizado (art. 20);
- reclamar à Autoridade Nacional de Proteção de Dados (ANPD).

Como pedir, sem custo:

- Ver e exportar os seus dados: no app, em Conta, Privacidade e dados, Exportar. Você confirma com a senha e recebe um arquivo legível (JSON e CSV) por link de uso único, válido por 7 dias.
- Excluir a conta: no app, em Conta, Privacidade e dados, Excluir minha conta; ou pelo site, em [a página de exclusão de conta]({{SITE_URL}}/excluir-conta), sem precisar do app. Veja o item 8.
- Retirar consentimentos (avisos de promoção): no app, em Conta, Notificações; ou pelo link no e-mail.
- Corrigir nome e celular: no app, quando a tela estiver disponível, ou pelo suporte. [REVISAR JURÍDICO J16: confirmar que a correção pelo app existe no lançamento ou retirar esta frase.]
- Qualquer outro pedido: pela página de exclusão de conta (formulário do encarregado) ou pelo e-mail {{DPO_EMAIL}}.

Respondemos em até 15 dias, contados do pedido (LGPD, art. 19, II). Por segurança, podemos pedir que você confirme que é o titular antes de agir, e não enviamos dados pessoais por e-mail: eles saem só pelo app ou por link de uso único. Se não houver conta com o e-mail informado, avisamos apenas que não há conta, sem confirmar nem negar outros dados.

Você também pode reclamar diretamente à ANPD (gov.br/anpd).

## 8. Exclusão de conta: o que acontece

- A conta fecha na hora: você sai de todos os aparelhos e não entra mais.
- Você tem 72 horas para desistir (no app, entrando de novo, ou pelo site). Passado o prazo, a exclusão não pode ser desfeita. [REVISAR JURÍDICO J15: confirmar o prazo de arrependimento como regra de produto e o texto "não pode ser desfeita".]
- Depois dessas 72 horas, apagamos ou anonimizamos os seus dados em até 15 dias e avisamos você por e-mail.
- Apagamos: nome, e-mail, celular, endereços salvos, favoritos, buscas, sacola, aparelhos conectados, preferências, fotos e relatos de troca, textos de avaliação e denúncia, e os cupons pessoais que você não usou (eles se perdem).
- Guardamos, sem identificação direta, o que a lei obriga: pedidos e pagamentos por 5 anos; registros de acesso por 6 meses; e a prova de aceite dos termos e consentimentos (item 6).
- Se houver pedido ou troca em andamento, pedimos que você conclua antes de excluir.
- Quem é dono de loja encerra a loja junto com a conta. Quem só quer sair da loja, sem excluir a conta, pede o encerramento ao suporte.
- Você pode usar o mesmo e-mail para criar uma conta nova depois, sem herdar dados antigos.

## 9. Crianças e adolescentes

O Webag é só para pessoas com 18 anos ou mais e não é dirigido a crianças e adolescentes. Quando você se cadastra, declara ter 18 anos. Se soubermos que uma conta pertence a menor de 18 anos, bloqueamos e excluímos a conta e os dados, ressalvados os que a lei obriga a guardar. Pais e responsáveis podem avisar pelo e-mail {{DPO_EMAIL}}. [REVISAR JURÍDICO J17: a autodeclaração de idade basta, ou o ECA Digital (Lei 15.211/2025) exige verificação de idade para um app de compras?]

## 10. Segurança

Usamos medidas técnicas e organizacionais para proteger os seus dados, entre elas: conexão cifrada (HTTPS); senhas guardadas de forma irreversível; CPF só em forma irreversível; chaves de acesso cifradas; documentos em armazenamento privado, com link temporário e registro de cada acesso; acesso da equipe limitado ao necessário, com registro das ações; segundo fator de autenticação obrigatório para administradores. Nenhum sistema é totalmente seguro. Se ocorrer um incidente que possa causar risco ou dano relevante a você, avisaremos você e a ANPD, nos termos da lei (LGPD, art. 48). [REVISAR JURÍDICO: prazo e canal de comunicação à ANPD; o procedimento é do responsável de segurança.]

Proteja a sua senha e não a compartilhe. O Webag nunca pede senha, código de verificação nem pagamento fora do app ou do site oficial.

## 11. Cookies e tecnologias semelhantes

- Site público (início, termos, privacidade, ajuda): não usa cookies, não usa ferramentas de análise e não usa publicidade.
- Painéis do lojista e da administração: usam apenas cookies estritamente necessários para manter a sessão de quem está logado, que o navegador não deixa páginas lerem (HttpOnly). Eles expiram quando você sai ou fica inativo.
- Aplicativo: não usa cookies. Guarda no próprio aparelho o identificador aleatório do aparelho, as chaves da sessão, o endereço aproximado escolhido e as suas preferências.

Se isso mudar (por exemplo, ferramentas de análise), atualizaremos esta política e, quando a lei exigir, pediremos o seu consentimento antes. [REVISAR JURÍDICO: confirmar que, no lançamento, não há análise nem cookie de terceiros.]

## 12. Transferência para outros países

Alguns prestadores podem tratar dados fora do Brasil, em especial os de notificações (Expo, Google, Apple), o WhatsApp (Meta) e, conforme o contrato, hospedagem e e-mail. Quando isso ocorrer, usamos os mecanismos que a LGPD permite (art. 33), como cláusulas contratuais padrão aprovadas pela ANPD, ou a necessidade de executar o contrato com você, e exigimos do prestador proteção compatível. [REVISAR JURÍDICO J10: conferir, prestador por prestador, o país, o mecanismo do art. 33 e a Resolução CD/ANPD nº 19/2024.]

## 13. Decisões automáticas e prevenção a fraude

Alguns benefícios são recusados automaticamente quando o sistema detecta abuso, por exemplo, cupom de primeira compra em várias contas do mesmo aparelho, telefone, endereço ou CPF. Isso não afeta o seu direito de comprar. Você pode pedir a revisão por uma pessoa pelo e-mail {{DPO_EMAIL}} (LGPD, art. 20). [REVISAR JURÍDICO J10: enquadramento como decisão automatizada.]

## 14. Alterações desta política

Podemos atualizar esta política. A versão em vigor fica sempre em [{{SITE_URL}}/privacidade]({{SITE_URL}}/privacidade), com a data de vigência. Quando a mudança for relevante, avisamos você no app e por e-mail e pedimos que você leia e aceite a nova versão antes de continuar usando o serviço. Se você não concordar, pode excluir a conta (item 8). Guardamos as versões anteriores e o registro do seu aceite (versão, data, hora e plataforma). [REVISAR JURÍDICO J15: prazo de antecedência do aviso.]

## 15. Fale com o encarregado

Encarregado: {{DPO_NAME}}. E-mail: {{DPO_EMAIL}}. Respondemos em até 15 dias.

## 16. Versão e vigência

Versão {{VERSAO}}. Em vigor desde {{VIGENCIA}}.

<!-- TEXTO-PUBLICO-FIM -->

## Lista consolidada [REVISAR JURÍDICO] desta política (NÃO publicar)

| Item | Onde | O que o advogado ou o encarregado precisa decidir |
|---|---|---|
| J18 | 2, 15 | Razão social, nome fantasia, endereço; quem é o encarregado; se pode ser o próprio fundador; dispensa do encarregado para agente de pequeno porte (Resolução CD/ANPD nº 2/2022) e se vale para marketplace; publicação do contato (LGPD art. 41 §1º) |
| J12 | 2, 3.4, 4, 5.1 | A loja como controladora própria para entrega e nota; base legal do tratamento de dados de lojistas |
| J10 | 4, 5.2 a 5.4, 12, 13 | Base legal da localização aproximada; legítimo interesse do antifraude (registro da avaliação); WhatsApp ao entregador (papel, instruções, apagamento); papéis do Mercado Pago; lista real de prestadores; transferência internacional por prestador (art. 33, Resolução CD/ANPD nº 19/2024); antifraude como decisão automatizada (art. 20) |
| J8 | 5.2 | Natureza da relação com o entregador (a política o chama de "parceiro") |
| J15 | 4, 6, 8, 14 | Todos os prazos do item 6 e a base legal de cada guarda (5 anos de prova de aceite com IP truncado, histórico de bloqueio, DSR, backup de 30 dias, tokens do Mercado Pago por 120 dias, contato da corrida por 7 dias); prazo de 72 h e a frase "não pode ser desfeita"; antecedência do aviso de mudança |
| J16 | 7 | Correção de nome e celular pelo app só existe se a tela (CC2) for entregue; senão retirar a frase |
| J17 | 9 | Autodeclaração de 18 anos x verificação de idade do ECA Digital |
| (sem J) | 10, 11 | Prazo e canal de comunicação de incidente à ANPD (security-engineer); confirmação de que não há análise nem cookie de terceiros no lançamento |
