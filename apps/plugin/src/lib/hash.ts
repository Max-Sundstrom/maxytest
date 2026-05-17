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

// IMPORTANT: do NOT use `crypto.subtle.digest` here. `crypto.subtle` is
// a secure-context-only API (HTTPS origin), and the Figma plugin iframe
// loads under a non-secure origin (effectively `null:`). At runtime that
// makes `crypto.subtle` `undefined` and the digest call throws
// "Cannot read properties of undefined (reading 'digest')" — the same
// secure-context restriction that bit `crypto.randomUUID` earlier.
//
// We fall back to `js-sha256`, a tiny zero-dep pure-JS SHA-256 that
// produces byte-identical output to crypto.subtle's SHA-256 algorithm
// (verified by __tests__/hash.test.ts cross-checks against Node's
// createHash). That preserves the dedup contract with the worker's
// `upsert: false` Storage paths.
import { sha256 as jsSha256 } from 'js-sha256';

/** SHA-256 hex over the first 16 chars (8 bytes) of the digest. */
export function sha256_16(buf: ArrayBuffer): string {
  // js-sha256 accepts ArrayBuffer/Uint8Array/string and returns a 64-char
  // lowercase hex string. We take the first 16 chars (8 bytes / 64 bits
  // of entropy — same as the previous crypto.subtle path).
  return jsSha256(buf).slice(0, 16);
}
