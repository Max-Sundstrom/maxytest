// apps/plugin/src/__tests__/hash.test.ts — Phase 02.2 Plan 06 (TDD).
//
// Asserts that sha256_16 returns the FIRST 16 HEX CHARACTERS (8 bytes) of
// the SHA-256 digest of the input — byte-identical to the worker's
// implementation at supabase/functions/figma-import-worker/index.ts:179-185.
//
// Why byte-identity matters: Storage paths from plugin and REST collide
// on identical PNG bytes (legitimate dedup). If hashes diverge, the same
// frame imported via both paths produces two different Storage objects
// AND the de-dup `upsert: false` "already exists" tolerance at worker
// line ~850 breaks, surfacing as a spurious `plugin_upload_failed` to
// the user.
//
// Expected hex values precomputed via Node's built-in crypto (the same
// SHA-256 implementation that backs Web Crypto's `crypto.subtle.digest`
// in Node 19+ — both yield the same byte sequence; only the API
// envelope differs):
//
//   node -e "console.log(require('crypto').createHash('sha256')
//     .update(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
//     .digest('hex').slice(0,16))"
//   // → '4c4b6a3be1314ab8'

import { describe, expect, it } from 'vitest';
import { sha256_16 } from '../lib/hash';

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('sha256_16', () => {
  it('Test 1: returns the first 16 hex chars of SHA-256("") = e3b0c44298fc1c14', async () => {
    const empty = new ArrayBuffer(0);
    const result = await sha256_16(empty);
    expect(result).toBe('e3b0c44298fc1c14');
  });

  it('Test 2: returns the first 16 hex chars of SHA-256("hello world") = b94d27b9934d3e08', async () => {
    const buf = new TextEncoder().encode('hello world').buffer as ArrayBuffer;
    const result = await sha256_16(buf);
    expect(result).toBe('b94d27b9934d3e08');
  });

  it('Test 3: returns the first 16 hex chars of SHA-256(PNG magic bytes) = 4c4b6a3be1314ab8', async () => {
    // PNG file signature 89 50 4E 47 0D 0A 1A 0A. Same prefix appears at
    // byte 0 of every frame.exportAsync({ format: 'PNG' }) output.
    const result = await sha256_16(PNG_MAGIC.buffer as ArrayBuffer);
    expect(result).toBe('4c4b6a3be1314ab8');
  });

  it('Test 4: cross-check vs Node crypto — same algorithm, same output (byte-identity proof)', async () => {
    const { createHash } = await import('node:crypto');
    // 256 bytes of pseudo-random data — exercises every digest position.
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = (i * 31 + 7) & 0xff;
    const buf = bytes.buffer as ArrayBuffer;

    const fromPlugin = await sha256_16(buf);
    const fromNode = createHash('sha256').update(Buffer.from(bytes)).digest('hex').slice(0, 16);

    expect(fromPlugin).toBe(fromNode);
  });

  it('Test 5: always returns exactly 16 characters regardless of input size', async () => {
    const small = await sha256_16(new ArrayBuffer(1));
    const big = await sha256_16(new Uint8Array(10_000).buffer as ArrayBuffer);
    expect(small).toHaveLength(16);
    expect(big).toHaveLength(16);
  });
});
