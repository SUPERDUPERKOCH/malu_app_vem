# HANDOFF — VEM · Vida em Movimento

Documento de continuidade para desenvolvimento no Claude Code/VS Code.

Data do handoff: 2026-11-06 (America/Sao_Paulo).

> Atenção: este diretório não contém metadados `.git`. O comando `git status` retorna “not a git repository”. Portanto, não foi possível distinguir de forma confiável arquivos commitados de alterações locais. A seção “Alterações locais” registra apenas o que foi confirmado durante a conversa e na última sessão de trabalho.

## 1. OBJETIVO DO PROJETO

### Finalidade

O VEM (“Vida em Movimento”) é um aplicativo mobile de acompanhamento de saúde e bem-estar para participantes de um programa pago. O produto reúne:

- autenticação e cadastro de participantes;
- controle de acesso baseado na compra do produto pela Kiwify;
- quiz de onboarding para recomendar treino e cardápio;
- treinos personalizados, registro de séries, repetições, cargas, descanso e histórico;
- alimentação/cardápio e registros diários;
- hábitos, água, humor e acompanhamento da rotina;
- evolução corporal, medidas e conquistas;
- encontros da comunidade, recompensas e conteúdo do programa;
- painel de preferências da participante;
- área administrativa para conteúdo do VEM.

O aplicativo começou como um protótipo HTML. A direção definida pelo usuário foi migrá-lo para uma aplicação React Native/Expo nativa em TypeScript, mantendo a identidade visual e evoluindo a persistência para Supabase. O arquivo `web/App_Vida_em_Movimento.html` é uma referência antiga; o esboço mais recente usado para importar conteúdo está fora do repositório, em `D:\Downloads\vem-app.html`.

### Tecnologias e versões confirmadas

Conforme `package.json`:

- Expo `~58.0.23`;
- React `19.3.0`;
- React Native `0.88.1`;
- TypeScript `~6.0.3`;
- React Navigation:
  - `@react-navigation/native ^7.5.1`;
  - `@react-navigation/native-stack ^7.21.0`;
  - `@react-navigation/bottom-tabs ^7.21.0`;
- Supabase:
  - `@supabase/supabase-js ^2.119.0`;
  - `@supabase/ssr ^0.12.7`;
- AsyncStorage `2.2.0` para persistência de sessão no mobile;
- `react-native-safe-area-context ~5.11.1`;
- `react-native-screens ~4.30.1`;
- `react-native-svg 15.16.0`;
- `expo-file-system ~58.0.13`;
- `expo-haptics ~58.0.7`;
- `expo-status-bar ~58.0.4`.

O TypeScript está em modo estrito, com `strict`, `noUncheckedIndexedAccess` e `noImplicitOverride` ativos.

### Arquitetura e estrutura

O ponto de entrada é `App.tsx`, que monta, nesta ordem:

1. `SafeAreaProvider`;
2. `VemThemeProvider`;
3. `VemLoaderProvider`;
4. `AuthProvider`;
5. `AppNavigator`.

Estrutura principal:

```text
vem-app/
├── assets/                         ícones e imagens do app
├── scripts/                        utilitários de importação/exportação
├── src/
│   ├── auth/                       sessão, login e carregamento do perfil
│   ├── components/                 componentes visuais compartilhados
│   ├── models/                     contratos de domínio TypeScript
│   ├── navigation/                 stack, bottom tabs e tipos das rotas
│   ├── screens/                    telas React Native
│   ├── services/                   acesso ao Supabase e regras de domínio
│   ├── theme/                      tokens, tema claro/escuro e hook do tema
│   └── types/database.ts           tipagem manual do schema Supabase
├── supabase/
│   ├── functions/kiwify-webhook/   Edge Function do webhook Kiwify
│   └── migrations/                 schema, RLS e seeds versionados
├── web/                            protótipo HTML antigo e ponte legada
├── App.tsx
├── app.json
├── index.ts / index.js
└── package.json
```

Decisões arquiteturais:

- telas não acessam o Supabase diretamente quando existe serviço de domínio; a lógica fica em `src/services`;
- conteúdo editorial é mantido em `public.content_documents` como JSONB, pois treinos, cardápios, curso e agenda são estruturas aninhadas e administráveis;
- dados transacionais/individuais ficam em tabelas normalizadas com RLS por `auth.uid()`;
- nomes do banco usam `snake_case`; modelos/telas usam `camelCase` e os serviços fazem o mapeamento;
- navegação principal usa seis abas: Início, Treino, Dieta, Evolução, VEM e Painel;
- a barra inferior respeita `safe-area` para navegação Android por gestos ou botões;
- participantes sem compra ativa não entram nas abas; são direcionados para uma tela de status de acesso com opção de checkout;
- administradores e coaches podem acessar sem assinatura de participante ativa.

## 2. HISTÓRICO DO DESENVOLVIMENTO

### Solicitações feitas pelo usuário

Em ordem aproximada, o usuário solicitou:

1. migrar o app/protótipo HTML para React Native nativo e TypeScript;
2. criar navegação, tema, componentes e modelos tipados;
3. corrigir incompatibilidades do React Navigation no bundler;
4. recuperar ícones e identidade visual do protótipo;
5. migrar login, Home, Treino, Dieta, Evolução, VEM e Painel;
6. integrar Supabase, perfis de usuário e separar nome/sobrenome;
7. criar schema e migrations de usuários/perfis;
8. integrar Kiwify via webhook e validar acesso à compra;
9. bloquear login funcional de quem não tem acesso e oferecer checkout;
10. corrigir safe area da barra inferior do Android;
11. carregar dados reais do perfil na Home e mostrar o primeiro nome;
12. migrar preferências, registros diários, treino, dieta e evolução para o banco;
13. migrar encontros, recompensas e administração;
14. criar importação única dos dados locais e remover dependência de `legacyStorage`/dados demo;
15. implementar quiz de onboarding e filtrar somente treino/cardápio indicados;
16. criar loader da marca “VEM / vamos juntos?” na abertura e após o quiz;
17. comparar um novo esboço HTML com o app e listar lacunas;
18. executar as lacunas em oito etapas, sempre uma de cada vez, com pausa para teste;
19. corrigir a edição de carga dos exercícios de academia;
20. iniciar a etapa 2: programação semanal, mobilidade e fases do treino.

### Funcionalidades implementadas

#### Base nativa e visual

- aplicação Expo/React Native em TypeScript;
- tema claro/escuro e tokens em `src/theme`;
- componentes `AppText`, `AppButton`, `AppCard`, `AppTextInput`, `Screen`, `VemIcon`;
- navegação stack + bottom tabs;
- safe area superior e inferior;
- feedback tátil em conclusão de séries e fim do descanso;
- loader visual da marca por `VemLoader`/`VemLoaderProvider`.

#### Autenticação, perfil e compra

- login, cadastro, logout e recuperação de senha via Supabase Auth;
- tabela `profiles` ligada a `auth.users`;
- nome e sobrenome separados (`first_name`, `last_name`), além de nome preferido;
- carregamento do perfil no `AuthProvider`;
- papéis `participant`, `coach` e `admin`;
- estados de assinatura e controle de acesso na navegação;
- tela `AccessStatusScreen` para usuário sem acesso, com botão de checkout;
- webhook Kiwify em `supabase/functions/kiwify-webhook/index.ts` com:
  - validação HMAC-SHA1;
  - deduplicação/upsert de eventos;
  - consolidação de pedidos;
  - atualização do acesso do perfil;
  - filtro opcional de produto por variável de ambiente.

Não registrar no código ou neste documento valores de tokens, chaves, URLs privadas ou segredos. O cliente usa apenas as variáveis públicas `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. O webhook usa secrets exclusivamente no servidor.

#### Quiz e recomendação

- quiz nativo em `QuizScreen`;
- persistência das respostas e recomendações em `onboarding_quizzes`;
- recomendação de modalidade, nível, programa e cardápio;
- bloqueio do fluxo principal até concluir o onboarding;
- somente o treino e o cardápio indicados aparecem para a participante;
- loader da marca ao finalizar o quiz.

#### Home e rotina

- saudação usando dados reais do perfil/primeiro nome;
- frase do dia;
- progresso semanal;
- treino do dia;
- água, humor, refeições, escolhas e hábitos;
- encontro/call quando disponível;
- persistência em `daily_checkins`.

#### Treino

- programas filtrados pela modalidade e nível do perfil;
- início, pausa, retomada, finalização e descarte da sessão;
- séries, repetições, carga e conclusão por série;
- descanso com cronômetro e vibração;
- histórico básico em `workout_sessions` e `workout_session_sets`;
- correção recente: a UI agora usa a flag editorial `kg` (`supportsLoad`) em vez de exigir carga inicial maior que zero. Antes, itens com carga inicial `0` apareciam incorretamente como “peso do corpo”.

#### Dieta

- carregamento dos cardápios do conteúdo editorial;
- exibição somente do cardápio recomendado;
- escolha de opção por refeição;
- soma de calorias do dia;
- registros em `food_entries` e integração com check-in diário;
- suporte no schema a foto (`photo_path`) e bucket/políticas correspondentes.

O diário alimentar completo ainda não foi implementado na interface.

#### Evolução

- medidas corporais;
- marcos/conquistas;
- resumo de treinos, dias e sequência;
- persistência em `body_measurements` e `progress_milestones`.

Gráficos, avaliação mensal e mapa avançado ainda são próximos passos.

#### VEM e administração

- recompensas globais e resgate por participante;
- próximos encontros e link de entrada;
- call configurável;
- tela administrativa básica para aviso, meta semanal, call, encontros e recompensas;
- tabelas `meetings`, `rewards` e `user_reward_redemptions` com RLS.

#### Migração/importação de dados

- importação única de dados locais em `src/services/legacyImport.ts`;
- marcação de `legacy_imported_at` no perfil;
- remoção do fluxo principal baseado em WebView/HTML e de `legacyStorage` como fonte operacional;
- o diretório `web` permanece como referência/arquivo legado, não como tela principal do aplicativo;
- script `scripts/extract-latest-draft-content.mjs` extrai somente os literais de conteúdo do esboço mais recente em um contexto VM restrito e gera JSON ou migration SQL;
- importação da versão mais recente encontrou e publicou:
  - 88 exercícios;
  - 6 programas;
  - 8 cardápios;
  - 3 módulos de curso;
  - 4 encontros;
  - 1 plano de corrida.

### Principais decisões técnicas

- **React Native nativo em vez de manter o HTML como UI:** melhora integração com safe area, navegação, formulários, notificações e recursos do dispositivo.
- **Supabase como fonte principal:** autenticação, dados do perfil, conteúdo e registros pessoais ficam sincronizados e protegidos por RLS.
- **Conteúdo editorial em JSONB:** preserva a estrutura rica do esboço (programas, fases, mobilidade, refeições, curso) sem criar dezenas de tabelas editoriais prematuramente.
- **Tabelas normalizadas para atividade do usuário:** sessões, séries, refeições, medidas, recompensas etc. precisam de consultas, histórico e RLS claros.
- **Versionamento de conteúdo:** migration `202611060011` adiciona versão, origem, data de publicação, metadados e histórico em `content_document_revisions`.
- **Migrações incrementais:** não alterar migrations já aplicadas no remoto; criar uma nova migration para qualquer mudança posterior.
- **Implementação por etapas com pausa:** pedido explícito do usuário; terminar uma etapa, validar, pedir teste e só continuar após autorização.

### Problemas encontrados e soluções

- **React Navigation não resolvia `useLocale.js`:** dependências foram alinhadas/reinstaladas durante a migração inicial. O app voltou a fazer bundle; a árvore atual usa React Navigation 7.
- **`expo-sharing` configurado como plugin inexistente:** a configuração/plugin foi removida. `app.json` atualmente possui `plugins: []` e o pacote não está em `dependencies`.
- **Texto fora de `<Text>`:** corrigido durante a migração das telas nativas.
- **Todos os treinos/cardápios apareciam:** serviços passaram a filtrar pela recomendação do quiz/perfil.
- **Barra inferior sobrepunha conteúdo:** `AppNavigator` calcula altura/padding com `useSafeAreaInsets()`.
- **Webhook Kiwify não chegava ao Supabase:** URL/token/configuração foram revisados; o código final exige assinatura HMAC válida e secrets no servidor. O status atual do deploy da Edge Function não foi revalidado nesta sessão de handoff.
- **Exercícios de academia apareciam como peso corporal:** `WorkoutScreen` verificava `loadKg > 0`; como a carga inicial é zero, escondia o input. Foi criado `supportsLoad`, mapeado de `item.kg`, e a tela passou a mostrar “carga a definir”.
- **PowerShell bloqueia `npx.ps1`:** no Windows deste ambiente, usar `npx.cmd` em vez de `npx` para comandos automatizados.
- **Documentação antiga:** `LEIA-ME.md` contém trechos desatualizados dizendo que o app ainda roda o HTML e salva dados principalmente no aparelho. Isso não corresponde integralmente à arquitetura atual nativa/Supabase e deve ser revisado futuramente.

## 3. ESTADO ATUAL

### Funcionando e confirmado

- autenticação e sessão Supabase;
- cadastro e perfil separado em nome/sobrenome;
- gate de acesso por papel/assinatura;
- navegação pelas seis abas;
- safe area da tab bar;
- quiz e recomendação;
- Home e check-ins diários;
- filtro de treino e cardápio indicados;
- sessão de treino, séries, cargas, descanso e conclusão;
- correção do input de carga usando `supportsLoad`;
- cardápio recomendado e escolha de refeições;
- medidas e marcos de evolução;
- recompensas, próximos encontros e administração básica;
- importação única do legado;
- loader da marca;
- migrations até `202611060012` aplicadas no banco remoto e confirmadas como atualizadas via `supabase db push --dry-run --remote`.

### Parcialmente implementado — tarefa em andamento

A etapa 2 (“programação semanal, mobilidade e fases dos treinos”) foi iniciada, mas foi interrompida por este pedido de handoff.

Já foi escrito localmente:

- migration `202611060013_add_workout_mobility_tracking.sql`;
- campos `mobility_completed_at` e `mobility_items` nos tipos do banco;
- novos tipos em `src/services/workouts.ts`:
  - `MobilityExercise`;
  - `ProgramPhase`;
  - `WorkoutProgramDetails`;
  - `WorkoutSchedule`;
- leitura de `mobilidade`, `fases`, `semana`, `cardio` e `regras` do documento editorial;
- seleção do treino sugerido pela programação semanal;
- cálculo da semana/fase atual;
- validação para usar cada treino exatamente uma vez e evitar dois treinos inferiores consecutivos;
- upsert em `user_workout_schedules`;
- registro da mobilidade na sessão ao iniciar o treino;
- UI inicial no `WorkoutScreen` para:
  - mostrar programa, semana e fase;
  - editar os sete dias da programação;
  - mostrar o plano do dia;
  - checklist obrigatório de mobilidade antes do treino.

Essa implementação ainda não foi executada no aparelho nem validada visualmente.

### Bugs conhecidos / bloqueadores atuais

1. **O projeto não compila neste momento.**

   Comando:

   ```powershell
   npx.cmd --no-install tsc --noEmit
   ```

   Erro atual:

   ```text
   src/services/workouts.ts(184,26): error TS2345:
   Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
   src/services/workouts.ts(184,55): error TS2345:
   Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
   ```

   A causa é `noUncheckedIndexedAccess`: `current` e `next`, obtidos de `weekdayPlan`, são `string | undefined` antes de serem passados a `lowerLetters.has(...)` em `validateWorkoutSchedule`. Correção provável e mínima:

   ```ts
   if (lowerLetters.has(current ?? '') && lowerLetters.has(next ?? '')) {
   ```

   Não foi aplicada porque o usuário pediu que, a partir do pedido de handoff, nenhum arquivo além deste documento fosse alterado.

2. **Migration 013 ainda não foi aplicada no Supabase remoto.**

   O código parcial de `startWorkout` já tenta gravar `mobility_completed_at` e `mobility_items`. Se o app for executado assim antes da migration, iniciar um treino pode falhar por coluna inexistente.

3. **UI da programação semanal não foi testada.**

   Verificar especialmente:

   - largura do resumo dos sete dias em celulares pequenos;
   - seleção e troca de treino entre dias;
   - mensagens da validação;
   - comportamento domingo/segunda na regra de treinos inferiores;
   - fluxo voltar/concluir checklist de mobilidade;
   - sugestão em dia de cardio ou descanso;
   - persistência e recarregamento da agenda.

4. **O campo `current_week` salvo em `user_workout_schedules` permanece inicialmente 1.**

   O serviço calcula a semana corrente a partir de `starts_on`, mas ainda não atualiza `current_week`/`phase_index` no banco. Isso não impede a UI atual, porém deve ser decidido se esses campos serão derivados ou persistidos.

5. **Status do deploy remoto da Edge Function Kiwify não foi verificado durante este handoff.**

   O código está presente e o fluxo foi trabalhado anteriormente, mas não afirmar estado de deploy sem consultar Supabase.

### Arquivos importantes

- `App.tsx`: composição dos providers e navegador.
- `src/navigation/AppNavigator.tsx`: gate de autenticação/compra/onboarding, stack e seis abas.
- `src/auth/AuthProvider.tsx`: sessão, perfil e importação única do legado.
- `src/services/supabase.ts`: cliente Supabase e persistência de sessão.
- `src/services/users.ts`: cadastro, consulta e atualização de perfis.
- `src/services/onboarding.ts`: regras e persistência do quiz.
- `src/services/home.ts`: montagem do dashboard da Home.
- `src/services/dailyCheckins.ts`: check-ins diários.
- `src/services/workouts.ts`: conteúdo de treino, agenda semanal, sessão, séries, carga, mobilidade e fases. Está parcialmente modificado e contém o erro TypeScript atual.
- `src/screens/WorkoutScreen.tsx`: UI de treinos; contém a nova UI ainda não testada de programação/fases/mobilidade.
- `src/services/nutrition.ts`: cardápio indicado e registros alimentares básicos.
- `src/services/modules.ts`: evolução, VEM e Painel.
- `src/services/administration.ts`: CRUD administrativo atual.
- `src/services/legacyImport.ts`: importação única dos dados locais.
- `src/types/database.ts`: tipos do schema, incluindo os campos da migration 013 ainda não aplicada.
- `src/models/content.ts`: contratos do conteúdo editorial versão 3.
- `supabase/functions/kiwify-webhook/index.ts`: webhook assinado da Kiwify.
- `supabase/migrations/202611060011_expand_vem_content_platform.sql`: expansão/versionamento do banco; aplicada.
- `supabase/migrations/202611060012_import_latest_vem_content.sql`: importação do esboço mais recente; aplicada.
- `supabase/migrations/202611060013_add_workout_mobility_tracking.sql`: tracking de mobilidade; ainda não aplicada.
- `scripts/extract-latest-draft-content.mjs`: extrai conteúdo do HTML mais recente e gera JSON/SQL.
- `web/App_Vida_em_Movimento.html`: protótipo anterior; não é a UI principal atual.
- `D:\Downloads\vem-app.html`: esboço mais recente usado como referência/importação; arquivo externo ao repositório e pode não estar disponível em outra máquina.

### Alterações locais conhecidas

Como não existe `.git`, não é possível produzir uma lista real de “uncommitted”. Alterações criadas/modificadas na etapa mais recente e confirmadas:

- criado `scripts/extract-latest-draft-content.mjs`;
- criado `src/models/content.ts`;
- atualizado `src/models/index.ts`;
- atualizado `src/types/database.ts`;
- criado `supabase/migrations/202611060011_expand_vem_content_platform.sql`;
- criado `supabase/migrations/202611060012_import_latest_vem_content.sql`;
- criado `supabase/migrations/202611060013_add_workout_mobility_tracking.sql`;
- atualizado `src/services/workouts.ts`;
- atualizado `src/screens/WorkoutScreen.tsx`;
- criado este `HANDOFF.md`.

As migrations 011 e 012 já foram aplicadas remotamente. A 013 existe apenas localmente.

## 4. PRÓXIMOS PASSOS

### Última tarefa em desenvolvimento

Etapa 2 do plano aprovado:

> Implementar programação semanal, mobilidade e fases dos treinos.

### Ponto exato onde o trabalho parou

O código da primeira versão foi escrito em `src/services/workouts.ts` e `src/screens/WorkoutScreen.tsx`. Ao executar o TypeScript, foram encontrados dois erros na linha 184 de `workouts.ts`. Nenhuma correção, migration remota ou teste no app foi feito depois disso porque o usuário interrompeu a tarefa para solicitar este handoff.

### Como continuar

1. Corrigir os dois erros de `string | undefined` em `validateWorkoutSchedule`.
2. Rodar:

   ```powershell
   npx.cmd --no-install tsc --noEmit
   ```

3. Revisar o diff manualmente, pois não há Git neste diretório.
4. Validar a migration 013 sem aplicar:

   ```powershell
   npx.cmd supabase db push --dry-run --remote
   ```

5. Com autorização explícita do usuário, aplicar:

   ```powershell
   npx.cmd supabase db push --remote --yes
   ```

6. Reiniciar o bundler limpando cache:

   ```powershell
   npm run start:clear
   ```

7. Testar no Android:

   - abrir aba Treino;
   - confirmar nome, semana e fase do programa indicado;
   - editar programação semanal;
   - verificar que cada treino precisa aparecer uma vez;
   - verificar alerta para dois treinos inferiores consecutivos;
   - salvar, sair da tela e voltar para confirmar persistência;
   - iniciar treino inferior;
   - marcar todos os itens da mobilidade;
   - confirmar que o treino só inicia após checklist completo;
   - registrar carga e séries;
   - finalizar e verificar a sessão no Supabase;
   - testar também treino sem mobilidade, cardio e descanso.

8. Ajustar layout/responsividade conforme o teste real.
9. Parar e pedir aprovação do usuário antes de começar a etapa 3.

### Critérios de conclusão da etapa 2

- TypeScript sem erros;
- migration 013 aplicada e banco remoto sem migrations pendentes;
- agenda semanal salva por usuário em `user_workout_schedules`;
- treino sugerido respeita a agenda personalizada;
- todos os treinos do programa aparecem exatamente uma vez por semana;
- distribuição inválida de inferiores é bloqueada ou claramente avisada conforme decisão de UX;
- fase e semana atuais aparecem corretamente;
- detalhes das fases são legíveis;
- treino com mobilidade abre checklist antes da sessão;
- conclusão da mobilidade é gravada em `workout_sessions`;
- treino sem mobilidade continua iniciando normalmente;
- carga, séries, timer, descanso e finalização anteriores não sofrem regressão;
- usuário testa e aprova antes da etapa seguinte.

### Plano posterior já aprovado, ainda não iniciar sem autorização

3. Criar o diário alimentar completo.
4. Implementar lembretes e notificações.
5. Completar o Mapa da Evolução.
6. Expandir a área administrativa.
7. Adicionar corrida, atividades externas e compartilhamento.
8. Finalizar encontros, curso, calendário e materiais.

## 5. INSTRUÇÕES PARA O CLAUDE

### Preferências explícitas do usuário

- agir como desenvolvedor sênior de aplicativos;
- manter o app nativo e TypeScript, sem voltar a usar HTML/WebView como interface principal;
- preservar identidade visual, ícones e comportamento do esboço VEM;
- trabalhar uma etapa por vez;
- depois de cada etapa, pausar, explicar o que mudou e pedir que o usuário teste/autorize a próxima;
- não exibir todos os treinos ou cardápios: mostrar apenas os indicados para a participante;
- respeitar Android com navegação por gestos e por botões;
- usar o primeiro nome real do perfil nas mensagens da Home;
- dados devem ser persistidos no Supabase, não em dados demo;
- não remover decisões existentes sem necessidade.

### Convenções adotadas

- TypeScript estrito; não contornar erros com `any` sem justificativa;
- componentes e interfaces em PascalCase;
- funções/variáveis em camelCase;
- banco em snake_case;
- textos da UI em português do Brasil;
- preferir interfaces explícitas para documentos editoriais e linhas do banco;
- manter acesso ao Supabase nos serviços;
- usar `AppText` para toda string renderizada;
- reutilizar `AppButton`, `AppCard`, `VemIcon` e tokens do tema;
- respeitar `SafeAreaView` e `useSafeAreaInsets`;
- usar `useFocusEffect` para recarregar dados ao voltar para a tela;
- tratar loading/erro sem deixar promises soltas em handlers;
- novas mudanças de banco devem ser migrations incrementais;
- proteger tabelas pessoais com RLS `user_id = auth.uid()`;
- conteúdo ativo é lido apenas por assinantes/coach/admin via `can_access_content()`;
- secrets nunca entram no app, `.env.example`, migrations, logs ou documentação;
- não editar migrations que já foram aplicadas (001–012); criar 014+ depois da 013 se necessário.

### Decisões que não devem ser alteradas sem necessidade

- Supabase continua sendo a fonte principal;
- `content_documents` continua sendo a fonte editorial para `workouts`, `meal_plans`, `course`, `agenda` e `general`;
- tabelas individuais continuam normalizadas e protegidas por RLS;
- gate de compra permanece no nível da navegação;
- quiz continua determinando programa/cardápio;
- o app não deve voltar a mostrar catálogos completos para participantes;
- a tab bar precisa continuar usando safe area inferior;
- importação legado é única e marcada no perfil;
- a Edge Function Kiwify não deve aceitar webhook sem assinatura válida;
- checkout e segredos não devem ser hardcoded em novos locais; centralizar/configurar quando for refatorado.

### Comandos de desenvolvimento

Instalar dependências:

```powershell
npm install
```

Verificar TypeScript:

```powershell
npx.cmd --no-install tsc --noEmit
```

Abrir Expo limpando cache:

```powershell
npm run start:clear
```

Executar Android/iOS/Web:

```powershell
npm run android
npm run ios
npm run web
```

Usar tunnel:

```powershell
npm run tunnel
```

Regerar a migration de conteúdo a partir de um HTML fornecido explicitamente:

```powershell
node scripts\extract-latest-draft-content.mjs "CAMINHO_DO_HTML" "CAMINHO_DA_SAIDA.sql"
```

Não regerar nem sobrescrever a migration 012, pois ela já foi aplicada. Para uma nova versão de conteúdo, gerar uma nova migration com timestamp/número posterior.

Validar migrations remotas:

```powershell
npx.cmd supabase db push --dry-run --remote
```

Aplicar migrations somente com autorização do usuário:

```powershell
npx.cmd supabase db push --remote --yes
```

### Pontos não confirmados

- não há repositório Git detectável neste diretório;
- não foi confirmado se existe outro clone com histórico Git;
- não foi revalidado o deploy atual da Edge Function Kiwify;
- não foi executado teste E2E ou suíte automatizada; não há scripts de teste declarados no `package.json`;
- a etapa 2 não foi testada em dispositivo;
- `LEIA-ME.md` está parcialmente desatualizado;
- credenciais e valores do `.env` foram deliberadamente omitidos deste documento.
