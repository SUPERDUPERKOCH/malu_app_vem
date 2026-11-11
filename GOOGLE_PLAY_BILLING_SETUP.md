# Assinatura Google Play sem intermediário

O app usa o Google Play Billing via `expo-iap`. Cada compra é validada no Supabase pela Google Play Developer API (`purchases.subscriptionsv2`). O app nunca libera acesso sozinho.

Fluxo:

1. A pessoa cria a conta VEM no app e toca em **Assinar com o Google Play**.
2. O app compra com `obfuscatedAccountId` = UUID do usuário no Supabase.
3. `verify-google-purchase` consulta o Google, confere produto e dono, confirma a compra (*acknowledge*) e grava em `google_subscriptions`.
4. `google-notifications` recebe as notificações em tempo real (RTDN) via Pub/Sub e reconsulta o Google a cada evento: renovação, cancelamento, suspensão, pausa, expiração e reembolso.
5. `refresh_profile_subscription` libera o acesso se **qualquer** fonte estiver ativa: Kiwify, Apple ou Google.

> A compra precisa ser confirmada em até 3 dias, ou o Google reembolsa automaticamente. O servidor confirma tanto na validação quanto na RTDN, então isso funciona mesmo se o app fechar logo após a compra.

## 1. Play Console — produto

Só aparece depois que o Play Console recebe um AAB com a biblioteca de Billing (qualquer build com `expo-iap`, enviado para **Teste interno**).

1. **Monetizar → Produtos → Assinaturas → Criar assinatura**
   - ID do produto: `clube_mensal`. O ID não pode ser alterado depois.
   - Nome: Clube VEM.
2. **Adicionar plano base**
   - ID: `mensal`.
   - Tipo: renovação automática, período mensal.
   - Defina preço e países.
   - Opcional: período de carência (recomendado de 3 a 7 dias) e suspensão de conta.
3. **Ative** o plano base.

O app usa o plano base sem ofertas promocionais. Se criar ofertas com teste grátis depois, ajuste `toOffer()` em `src/services/subscriptions.ts`.

## 2. Google Cloud — conta de serviço

1. No Google Cloud do projeto, ative a **Google Play Android Developer API**.
2. Em **IAM → Contas de serviço**, crie, por exemplo, `vem-play-billing`.
3. Em **Chaves → Adicionar chave → JSON**, baixe o arquivo. **Nunca coloque esse arquivo no app nem no Git.**
4. No Play Console, em **Usuários e permissões → Convidar usuário**, use o e-mail da conta de serviço e, no app VEM, dê as permissões:
   - *Ver informações financeiras, pedidos e respostas da pesquisa de cancelamento*
   - *Gerenciar pedidos e assinaturas*

A permissão pode levar algumas horas para valer. Antes disso, a API responde 401 ou 403.

## 3. Pub/Sub — notificações em tempo real (RTDN)

1. Em **Pub/Sub → Tópicos**, crie o tópico `play-rtdn`.
2. Em **Permissões do tópico**, adicione `google-play-developer-notifications@system.gserviceaccount.com` com o papel **Publicador do Pub/Sub**.
3. Em **Criar assinatura** do tópico:
   - Tipo: **Push**.
   - Endpoint: `https://SEU-PROJETO.supabase.co/functions/v1/google-notifications`.
   - **Ativar autenticação**: escolha uma conta de serviço (pode ser a mesma do passo 2).
   - Público-alvo (*audience*): a própria URL do endpoint.
   - Se a criação reclamar de permissão, dê ao agente do Pub/Sub (`service-NUMERO@gcp-sa-pubsub.iam.gserviceaccount.com`) o papel **Criador de token da conta de serviço** nessa conta.
4. No Play Console, em **Monetizar → Configuração de monetização → Notificações do desenvolvedor em tempo real**:
   - Tópico: `projects/ID-DO-PROJETO/topics/play-rtdn`.
   - Tipo: **Assinaturas, compras anuladas e todos os produtos únicos**.
   - Clique em **Enviar notificação de teste**. Nos logs da função deve aparecer `test: true`.

## 4. Secrets das Edge Functions

Crie um arquivo local **fora do Git**, por exemplo `supabase/.env.google`:

```text
GOOGLE_PLAY_PACKAGE_NAME=com.gkvidotto.vemvidaemmovimento
GOOGLE_PLAY_SUBSCRIPTION_ID=clube_mensal
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account", ... conteúdo do JSON em uma linha ...}
GOOGLE_PUBSUB_AUDIENCE=https://SEU-PROJETO.supabase.co/functions/v1/google-notifications
GOOGLE_PUBSUB_SERVICE_ACCOUNT=vem-play-billing@ID-DO-PROJETO.iam.gserviceaccount.com
```

```bash
supabase secrets set --env-file supabase/.env.google
```

Alternativa ao OIDC: defina `GOOGLE_RTDN_TOKEN` com um segredo aleatório e use o endpoint `.../google-notifications?token=SEGREDO`. O OIDC é preferível.

## 5. Variável pública do app

No EAS (`development`, `preview` e `production`):

```text
EXPO_PUBLIC_GOOGLE_SUBSCRIPTION_PRODUCT_ID=clube_mensal
```

## 6. Publicação

```bash
supabase db push
supabase functions deploy verify-google-purchase
supabase functions deploy google-notifications --no-verify-jwt
```

## 7. Testes

1. Em **Play Console → Configuração → Teste de licença**, adicione os e-mails de teste. Eles compram com cartões de teste, sem cobrança.
2. Instale pela faixa de **teste interno**. Sideload ou Expo Go não funcionam com o Billing.
3. Para contas de teste, a renovação mensal acontece **a cada 5 minutos** (até 6 renovações).

Valide que:

- a compra abre a folha do Google Play e o perfil só muda para `active` após `verify-google-purchase`;
- **Restaurar compras** recupera o acesso em outro aparelho com a mesma conta Google;
- a assinatura aparece como confirmada em **Pedidos** e não é reembolsada após 3 dias;
- cancelar em **Play Store → Pagamentos e assinaturas** mantém o acesso até o fim do período e depois vira `cancelled`;
- o cartão de teste "recusado" leva à carência e depois a `suspended` (ON_HOLD);
- o reembolso com revogação em **Gerenciamento de pedidos** encerra o acesso;
- os logs de `google-notifications` não têm erros (500 faz o Pub/Sub reenviar).
