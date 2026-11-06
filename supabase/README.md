# Banco Supabase do VEM

As credenciais e identidades são gerenciadas por `auth.users`. A tabela `public.profiles` contém os dados usados pelo aplicativo e tem o mesmo `id` do usuário autenticado.

## Aplicar a migração

Com o Supabase CLI vinculado ao projeto:

```bash
npx supabase login
npx supabase link --project-ref woldsouferdxbbisxqjz
npx supabase db push
```

Alternativamente, copie o conteúdo do arquivo em `migrations/` para o SQL Editor do painel Supabase e execute uma vez.

Depois da migração, novos cadastros criam o perfil automaticamente. Contas já existentes recebem um perfil pelo backfill incluído na migração.

## Webhook da Kiwify

O endpoint da Kiwify é uma Edge Function pública, mas toda requisição precisa ter
uma assinatura HMAC-SHA1 válida. A URL de produção é:

```text
https://woldsouferdxbbisxqjz.supabase.co/functions/v1/kiwify-webhook
```

Configure o mesmo token nos secrets do Supabase e no campo Token do webhook da
Kiwify. Nunca coloque esse token no `.env` do aplicativo ou em variáveis
`EXPO_PUBLIC_*`.

```bash
npx supabase secrets set KIWIFY_WEBHOOK_TOKEN=seu-token-longo
npx supabase functions deploy kiwify-webhook --no-verify-jwt
```

No painel da Kiwify, ative pelo menos `compra_aprovada`,
`compra_reembolsada` e `chargeback`. Para produtos recorrentes, ative também os
eventos de renovação, atraso e cancelamento da assinatura.
