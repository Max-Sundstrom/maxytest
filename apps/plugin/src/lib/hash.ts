// apps/plugin/src/lib/hash.ts — Phase 02.2 Plan 06.
//
// BYTE-IDENTICAL to supabase/functions/figma-import-worker/index.ts:179-185.
// If you "improve" this — Storage paths will diverge between plugin and
// REST imports, and the worker's `upsert: false` dedup at line ~850
// breaks: identical PNG bytes uploaded via the plugin produce a different
// hash → different Storage key → spurious duplicate object + a
// `plugin_upload_failed` warning surfacing in the plugin UI for the user.
//
// Vitest cross-check (__tests__/hash.test.ts Test 4) asserts the
// equivalence against Node's createHash, which uses the same underlying
// SHA-256 implementation as the Edge Function (Deno) runtime. Web Crypto
// is a thin API wrapper; the byte output is platform-stable.
//
// `noUncheckedIndexedAccess: true` is inherited from tsconfig.base.json,
// hence the `bytes[i]!` non-null assertion. The assertion is safe because
// the loop condition `i < bytes.length` proves the access is in-bounds.
//
// Web Crypto availability: this module compiles under TWO tsconfigs —
// tsconfig.code.json (sandbox, no DOM lib) and tsconfig.ui.json (DOM lib).
// The UI bundle gets `crypto.subtle` from the DOM lib for free; the
// sandbox runtime DOES have `crypto.subtle` (Figma's JS host is Chromium-
// based) but tsconfig.code.json deliberately excludes DOM so we ambient-
// declare the minimum surface we use. This keeps the sandbox bundle
// strictly typed without pulling in the entire DOM.

// Ambient declaration scoped to this module (TS removes it at emit).
declare const crypto: {
  subtle: { digest(alg: string, data: ArrayBuffer): Promise<ArrayBuffer> };
};

/** SHA-256 hex over the first 16 chars (8 bytes) of the digest. */
export async function sha256_16(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, '0');
  return hex.slice(0, 16);
}
