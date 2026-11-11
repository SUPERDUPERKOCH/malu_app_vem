# Assinatura Apple sem intermediário

O aplicativo usa StoreKit via `expo-iap` e valida cada transação no Supabase com a biblioteca oficial App Store Server Library. RevenueCat não é utilizado.

## App Store Connect

1. Crie um grupo de assinaturas e uma assinatura autorrenovável.
2. Use o mesmo ID do produto configurado no app e no Supabase.
3. Em **App Store Server Notifications**, configure a URL de produção e sandbox como:
   `https://SEU-PROJETO.supabase.co/functions/v1/apple-notifications`
4. Selecione notificações V2.

## Variável pública do app

Configure no ambiente EAS (`development`, `preview` e `production`):

```text
EXPO_PUBLIC_APPLE_SUBSCRIPTION_PRODUCT_ID=com.gkvidotto.vemvidaemmovimento.clube.mensal
```

O ID do produto não é segredo. Não coloque chave privada da Apple no app ou no EAS.

## Secrets das Edge Functions

Configure no Supabase:

```text
APPLE_BUNDLE_ID=com.gkvidotto.vemvidaemmovimento
APPLE_APP_ID=6833074281
APPLE_SUBSCRIPTION_PRODUCT_ID=com.gkvidotto.vemvidaemmovimento.clube.mensal
APPLE_ROOT_CERTIFICATES_BASE64=["CERTIFICADO_G2_EM_BASE64","CERTIFICADO_G3_EM_BASE64"]
```

Baixe `Apple Root CA - G2` e `Apple Root CA - G3` na página oficial Apple PKI. Converta os arquivos `.cer` em PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('AppleRootCA-G2.cer'))
[Convert]::ToBase64String([IO.File]::ReadAllBytes('AppleRootCA-G3.cer'))
```

## Publicação no Supabase

```bash
supabase db push
supabase functions deploy verify-apple-purchase
supabase functions deploy apple-notifications --no-verify-jwt
```

## Teste

É necessário um development build/preview build novo, porque `expo-iap` possui código nativo. Expo Go não suporta esse fluxo. Teste com uma conta Sandbox Apple e confirme que:

- a compra abre a folha nativa da Apple;
- o perfil muda para `active` somente após validação;
- restaurar compra recupera o acesso;
- cancelamento/expiração recebido pela Apple atualiza o perfil.
