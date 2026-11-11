# Checklist de publicação — VEM

Auditoria realizada em 10/11/2026. Atualizado em 10/11/2026 com as correções de código (exclusão de conta, links legais, permissões, assinatura e configuração iOS). O aplicativo **ainda não deve ser enviado para revisão pública**. A integração de assinatura Apple e Supabase está implantada, mas os bloqueadores abaixo precisam ser resolvidos.

## Estado confirmado

- [x] Bundle/package ID: `com.gkvidotto.vemvidaemmovimento`.
- [x] Apple ID do app: `6833074281`.
- [x] Apple ID da assinatura: `6833085149`.
- [x] Product ID Apple: `com.gkvidotto.vemvidaemmovimento.clube.mensal`.
- [x] Compra Apple implementada com `expo-iap`.
- [x] Restauração de compras Apple implementada.
- [x] Validação server-side implementada no Supabase.
- [x] Migration de assinaturas Apple aplicada.
- [x] Edge Functions `verify-apple-purchase` e `apple-notifications` publicadas.
- [x] App Store Server Notifications configuradas.
- [x] Product ID configurado nos ambientes EAS development, preview e production.
- [x] Checkout Kiwify removido do app (iOS e Android).
- [x] Ícone principal e ícones adaptativos Android em 1024×1024.

## Bloqueadores obrigatórios

### 1. Exclusão de conta

- [x] Criar **Painel → Conta → Excluir minha conta**. Também disponível na tela de status, para contas sem assinatura.
- [x] Exigir confirmação clara e, se necessário, reautenticação. Senha + confirmação final.
- [x] Criar Edge Function autenticada para excluir o usuário do Supabase Auth. `delete-account` — **falta publicar** (`supabase functions deploy delete-account`).
- [x] Excluir os dados vinculados ao usuário. Via `on delete cascade`; pedidos Kiwify ficam desvinculados (retenção fiscal).
- [x] Excluir fotos e arquivos do usuário no Supabase Storage.
- [x] Informar que excluir a conta não cancela uma assinatura da Apple.
- [x] Oferecer acesso ao gerenciamento/cancelamento da assinatura antes da exclusão.
- [ ] Criar página pública de exclusão, por exemplo `https://vemclube.com.br/excluir-conta`.
- [ ] Informar essa URL no formulário de segurança dos dados do Google Play.

Situação atual: exclusão implementada no app; falta publicar a Edge Function `delete-account` (e a `apple-notifications` atualizada) e a página pública, que ainda retorna 404.

### 2. Política de privacidade

- [ ] Publicar uma página HTTPS pública, sem login e que não seja PDF.
- [ ] Configurar a URL no App Store Connect.
- [ ] Configurar a URL no Google Play Console.
- [ ] Configurar `EXPO_PUBLIC_PRIVACY_POLICY_URL` nos três ambientes EAS. Opcional: sem a variável, o app usa `https://vemclube.com.br/privacidade` (`src/config/links.ts`).
- [x] Disponibilizar o link dentro do app, preferencialmente também em **Painel**. Painel → Privacidade e termos, e paywall/tela de status.

A política deve explicar:

- Nome, sobrenome, e-mail, idade e data de nascimento.
- Altura, peso, medidas corporais e avaliações.
- Informações de saúde, lesões e gestação.
- Treinos, cargas, corridas e evolução.
- Alimentação e fotos de refeições.
- Dados de assinatura e histórico de compras.
- Uso do Supabase e da API TACO/Brolesi.
- Finalidade, retenção, compartilhamento e exclusão dos dados.
- Canal de contato do responsável.
- Se os dados são vendidos, usados em publicidade ou rastreamento.

Situação atual: o link já está no app, mas `/privacidade` ainda retorna 404.

### 3. Pagamento no Android

O checkout externo da Kiwify para acesso digital pode causar reprovação no Google Play.

Escolher e implementar uma estratégia:

Estratégia escolhida: Google Play Billing **e** remoção dos links da Kiwify. A venda pela Kiwify continua fora do app; quem comprou lá só entra com a mesma conta. Passo a passo em `GOOGLE_PLAY_BILLING_SETUP.md`.

- [x] Integrar Google Play Billing com `expo-iap` e Supabase (código).
- [ ] Criar a assinatura `clube_mensal` / plano base `mensal` no Google Play Console.
- [ ] Configurar conta de serviço, Pub/Sub (RTDN), secrets e `EXPO_PUBLIC_GOOGLE_SUBSCRIPTION_PRODUCT_ID` nos três ambientes EAS.
- [ ] Publicar: `supabase db push`, `verify-google-purchase` e `google-notifications`.
- [x] Remover do app (Android e iOS) todo botão, texto e fluxo que direcione ao checkout externo da Kiwify.
- [x] Nunca aceitar como prova de compra dados fornecidos apenas pelo aplicativo. O app envia só o `purchaseToken`; produto, dono e status vêm da API do Google.
- [x] Validar compras Google no backend antes de liberar acesso (`verify-google-purchase`, com acknowledge no servidor).
- [x] Tratar renovação, cancelamento, reembolso e restauração (RTDN em `google-notifications` + Restaurar compras).
- [ ] Testar compra, restauração, cancelamento, suspensão e reembolso com testadores de licença no teste interno.

### 4. Dependência nativa ausente

O `expo-doctor` encontrou `react-native-worklets` ausente, dependência exigida por `react-native-reanimated`.

- [x] Executar `npx expo install react-native-worklets`. Versão 0.13.0.
- [x] Executar `npx expo-doctor` novamente. 20/20.
- [ ] Gerar nova build nativa; Expo Go não é suficiente.
- [ ] Fazer smoke test em Android e iPhone físicos.

### 5. Permissões Android restritas ou antigas

- [x] Remover `android.permission.USE_EXACT_ALARM`. Também `SCHEDULE_EXACT_ALARM` em `blockedPermissions`.
- [x] Usar notificações agendadas normais/inexatas para os lembretes.
- [x] Remover `android.permission.WRITE_EXTERNAL_STORAGE` do manifesto final. Bloqueada no `app.json`; em Android 9 ou anterior, salvar na galeria deixa de funcionar (compartilhar continua).
- [x] Confirmar que `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` e demais permissões amplas continuam bloqueadas.
- [x] Usar seletor de fotos do sistema para acesso pontual.
- [ ] Inspecionar o AndroidManifest da build de produção.

## Saúde, treino e alimentação

- [ ] Adicionar aviso visível no app e nas descrições das lojas: (no app: feito em Painel → Privacidade e termos; falta nas descrições das lojas)

> O VEM oferece conteúdo educacional de atividade física e alimentação. Não é um dispositivo médico e não realiza diagnóstico, tratamento, cura ou prevenção de doenças. Consulte profissionais de saúde antes de iniciar exercícios ou mudanças alimentares.

- [x] Manter bloqueio de cardápios para gestantes e pessoas com condições de saúde quando aplicável.
- [ ] Revisar textos que possam prometer resultados, diagnóstico ou tratamento.
- [ ] Documentar a origem/metodologia de cálculos calóricos e recomendações.
- [ ] Evitar alegações de precisão clínica.
- [ ] No Google Play, declarar **Atividade e Fitness**.
- [ ] No Google Play, declarar **Nutrição e controle de peso**.
- [ ] Preencher integralmente a declaração de apps de saúde.

## Assinatura Apple — App Store Connect

- [x] Definir preço e disponibilidade por país/região — R$ 69,90/mês no Brasil; todos os países e regiões selecionados.
- [ ] Adicionar nome localizado da assinatura em português — pendente e necessário para o produto aparecer no Sandbox.
- [ ] Adicionar descrição localizada — pendente e necessário para o produto aparecer no Sandbox.
- [ ] Adicionar nome localizado em português ao grupo `clube_vem_mensal`.
- [ ] Adicionar captura de tela para revisão da assinatura.
- [ ] Preencher notas para o revisor — assinatura e versão 1.0 ainda estão sem instruções.
- [ ] Configurar política de privacidade funcional — `Privacy Policy URL` vazio e declaração de coleta ainda não iniciada.
- [x] Confirmar os Termos de Uso/EULA — contrato padrão da Apple selecionado.
- [ ] Adicionar a assinatura à nova versão do aplicativo — ambos ainda em `Prepare for Submission`.
- [ ] Adicionar a assinatura e o grupo à mesma submissão da primeira versão.
- [x] Confirmar contrato de apps pagos — ativo desde 10/11/2026.
- [x] Confirmar dados bancários e fiscais no painel — ativos; confirmar separadamente a titularidade bancária pelo CNPJ do MEI.
- [ ] Fornecer conta de revisão com instruções completas — `Sign-in required` marcado, mas usuário, senha e notas estão vazios.
- [ ] Preferencialmente fornecer conta com assinatura expirada para o revisor testar todo o fluxo.
- [ ] Testar compra com conta Sandbox.
- [ ] Testar restauração de compra.
- [ ] Testar cancelamento, expiração e reembolso.
- [ ] Confirmar atualização do perfil no Supabase após cada evento.

## Gerenciamento de assinatura

- [x] Adicionar botão **Gerenciar assinatura** no Painel e na tela de status.
- [x] No iOS, abrir a interface nativa ou `https://apps.apple.com/account/subscriptions`.
- [x] Explicar que a assinatura renova automaticamente até ser cancelada.
- [x] Manter **Restaurar compras** visível e funcional.
- [x] Exibir nome, duração, benefícios e preço total localizado da assinatura.

## Privacidade nas lojas

### App Store Connect — Privacidade do app

Revisar e declarar, quando coletados e vinculados ao usuário:

- [ ] Nome.
- [ ] E-mail.
- [ ] Identificador do usuário.
- [ ] Saúde.
- [ ] Fitness.
- [ ] Fotos.
- [ ] Conteúdo do usuário.
- [ ] Compras.
- [ ] Interações com o produto.
- [ ] Dados processados por terceiros.
- [ ] Confirmar que não há rastreamento publicitário, se isso for verdadeiro.

### Google Play — Segurança dos dados

- [ ] Declarar todos os dados coletados.
- [ ] Declarar dados compartilhados e processadores.
- [ ] Informar finalidade de cada tipo de dado.
- [ ] Confirmar criptografia em trânsito.
- [ ] Informar política de retenção.
- [ ] Informar possibilidade de exclusão.
- [ ] Informar que o uso exige conta.
- [ ] Declarar fotos, saúde e fitness corretamente.
- [ ] Cadastrar a URL pública de exclusão de conta.

## Configurações técnicas

### iPad

- [x] Decidir se o lançamento inicial realmente suportará iPad. Não.
- [x] Se não: alterar `ios.supportsTablet` para `false`.
- [ ] Se sim: testar todas as telas em iPad e produzir screenshots obrigatórios.

### Segurança de rede iOS

- [x] Definir `NSAllowsArbitraryLoads` como `false`.
- [x] Confirmar que todos os endpoints usados pelo aplicativo são HTTPS.
- [ ] Inspecionar o Info.plist da build final.
- [x] Configurar o manifesto de privacidade iOS (`ios.privacyManifests`).

### Tema, splash e barras do sistema

- [ ] Instalar/configurar `expo-system-ui` para `userInterfaceStyle: automatic`.
- [ ] Criar splash nativa com identidade VEM.
- [ ] Substituir a configuração obsoleta `androidStatusBar` pela abordagem atual.
- [ ] Testar tema claro e escuro.
- [ ] Testar navegação Android por gestos e por botões.

### Versões e builds

- [ ] Confirmar versão pública do app.
- [ ] Confirmar `buildNumber` iOS e `versionCode` Android.
- [x] Executar `npx tsc --noEmit`.
- [ ] Executar `npx expo install --check`.
- [x] Executar `npx expo-doctor` e obter 20/20 verificações.
- [ ] Gerar build iOS de produção.
- [ ] Gerar AAB Android de produção.
- [ ] Confirmar que nenhuma chave privada ou `service_role` entrou no bundle.

## Materiais das lojas

- [x] Ícone principal 1024×1024.
- [x] Ícones adaptativos Android.
- [ ] Screenshots de iPhone.
- [ ] Screenshots Android.
- [ ] Screenshots de iPad, caso o suporte permaneça habilitado.
- [ ] Feature graphic Google Play 1024×500.
- [ ] Descrição curta.
- [ ] Descrição completa.
- [ ] Palavras-chave da App Store.
- [ ] URL de suporte.
- [ ] URL de marketing, se desejada.
- [ ] E-mail de suporte.
- [ ] Categoria principal e secundária.
- [ ] Classificação etária e questionário de conteúdo.
- [ ] Notas para revisão.
- [ ] Conta de teste para os revisores.
- [ ] Instruções para acessar áreas bloqueadas.

## Testes obrigatórios antes do envio

- [ ] Cadastro com compra Apple válida.
- [ ] Cadastro sem compra válida.
- [ ] Login de usuário existente.
- [ ] Compra Apple Sandbox.
- [ ] Cancelamento da folha de compra.
- [ ] Restauração de compra.
- [ ] Renovação Sandbox.
- [ ] Expiração e cancelamento.
- [ ] Exclusão de conta com e sem assinatura ativa.
- [ ] Permissão de notificações aceita e recusada.
- [ ] Permissão de câmera/fotos aceita e recusada.
- [ ] Login com teclado aberto em telas pequenas.
- [ ] Modo claro e escuro.
- [ ] Android com gestos e botões.
- [ ] iPhone físico via TestFlight.
- [ ] Android físico via teste fechado do Google Play.
- [ ] Teste offline e com conexão instável.
- [ ] Teste de inicialização limpa após instalar a build.
- [ ] Conferir logs das Edge Functions e ausência de erros.

## Critério de liberação

O app só deve ser enviado para revisão pública quando:

- [ ] Todos os itens da seção **Bloqueadores obrigatórios** estiverem concluídos.
- [ ] Política de privacidade e exclusão de conta estiverem publicamente acessíveis.
- [ ] O fluxo Android estiver compatível com a política de pagamentos do Google.
- [ ] `expo-doctor` estiver sem falhas.
- [ ] Builds de produção tiverem sido testadas em aparelhos físicos.
- [ ] Compra, restauração, cancelamento e exclusão tiverem sido validados ponta a ponta.
- [ ] Formulários de privacidade, saúde e segurança dos dados estiverem preenchidos nas lojas.
- [ ] Metadados, screenshots e credenciais de revisão estiverem completos.

## Referências oficiais

- Apple — exclusão de conta: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple — assinaturas: https://developer.apple.com/app-store/subscriptions/
- Apple — privacidade: https://developer.apple.com/app-store/app-privacy-details/
- Apple — revisão: https://developer.apple.com/app-store/review/guidelines/
- Google Play — exclusão de conta: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play — pagamentos: https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play — saúde: https://support.google.com/googleplay/android-developer/answer/16679511
- Google Play — declaração de saúde: https://support.google.com/googleplay/android-developer/answer/14738291
- Google Play — permissões sensíveis: https://support.google.com/googleplay/android-developer/answer/16558241
