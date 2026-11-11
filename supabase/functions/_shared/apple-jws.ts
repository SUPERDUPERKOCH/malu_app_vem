import 'npm:reflect-metadata@0.2.2';
import { X509Certificate } from 'npm:@peculiar/x509@2.2.0';
import { compactVerify } from 'npm:jose@6.1.2';

interface AppleJwsHeader { alg?: unknown; x5c?: unknown }

const APPLE_RECEIPT_SIGNER_OID = '1.2.840.113635.100.6.11.1';
const APPLE_WWDR_INTERMEDIATE_OID = '1.2.840.113635.100.6.2.1';

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function parseRoots(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string' && !!item);
  } catch { /* formato legado tratado abaixo */ }
  return value.trim().replace(/^\[/, '').replace(/\]$/, '').split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** Verifica ES256 e toda a cadeia x5c até uma raiz Apple configurada. */
export async function verifyAppleJws<T extends Record<string, unknown>>(signed: string, rootsValue: string): Promise<T> {
  if (signed.length > 100_000) throw new Error('apple_jws_too_large');
  const parts = signed.split('.');
  if (parts.length !== 3) throw new Error('apple_jws_invalid');
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0]!))) as AppleJwsHeader;
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 2 || header.x5c.length > 5) {
    throw new Error('apple_jws_header_invalid');
  }
  const chainValues = header.x5c.filter((item): item is string => typeof item === 'string' && item.length <= 10_000);
  if (chainValues.length !== header.x5c.length) throw new Error('apple_certificate_chain_invalid');
  const chain = chainValues.map((item) => new X509Certificate(item));
  const now = new Date();
  for (let index = 0; index < chain.length - 1; index += 1) {
    if (!await chain[index]!.verify({ publicKey: chain[index + 1]!, date: now })) {
      throw new Error('apple_certificate_chain_invalid');
    }
  }
  const trustedRoots = parseRoots(rootsValue).map((item) => new X509Certificate(item));
  const chainRoot = chain[chain.length - 1]!;
  let trusted = false;
  for (const root of trustedRoots) {
    if (await chainRoot.verify({ publicKey: root, date: now }).catch(() => false)) { trusted = true; break; }
  }
  if (!trusted) throw new Error('apple_certificate_root_untrusted');
  // A raiz Apple também assina certificados de outros serviços e de desenvolvedores.
  // Como na App Store Server Library oficial, exigimos a cadeia de 3 certificados e os
  // OIDs de assinatura da App Store no certificado final e no intermediário.
  const hasExtension = (certificate: X509Certificate, oid: string) =>
    certificate.extensions.some((extension) => extension.type === oid);
  if (chain.length !== 3 ||
    !hasExtension(chain[0]!, APPLE_RECEIPT_SIGNER_OID) ||
    !hasExtension(chain[1]!, APPLE_WWDR_INTERMEDIATE_OID)) {
    throw new Error('apple_certificate_not_app_store');
  }
  const key = await chain[0]!.publicKey.export(
    { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' },
    ['verify'],
  );
  const verified = await compactVerify(signed, key, { algorithms: ['ES256'] });
  return JSON.parse(new TextDecoder().decode(verified.payload)) as T;
}
