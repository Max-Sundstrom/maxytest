/**
 * Deno unit tests for the pure tree-trim helpers in figma-import-worker.
 *
 * Plan: 02.1-01 / Task 1 — covers D-01a (figma_node_tree trim) acceptance.
 *
 * NOTE on file naming: the plan originally specified `index.test.ts`, but a
 * Vitest integration test (W-08 + B-05 against the deployed Edge Function)
 * already occupies that path. Putting Deno unit tests in a separate
 * `trim.test.ts` file preserves both test suites and is the cleanest fix.
 *
 * Run from the repo root:
 *
 *   deno test supabase/functions/figma-import-worker/trim.test.ts \
 *     --allow-env --no-check
 *
 * The Deno std assert version follows the platform default for Supabase Edge
 * Runtime (Deno 1.40+ ships std@0.224.0 friendly).
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { collectFrames, trimFigmaDocument, trimFigmaTree } from './index.ts';
import type { FigmaFileResponse, FigmaNode } from './index.ts';

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

/** A minimal frame node with several extra keys that MUST be stripped. */
function makeBloatedFrame(id: string, opts?: Partial<FigmaNode>): FigmaNode {
  return {
    id,
    name: 'Frame ' + id,
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
    prototypeInteractions: [
      {
        trigger: { type: 'ON_CLICK' },
        actions: [{ type: 'NODE', destinationId: 'target-1', transition: { type: 'DISSOLVE' } }],
      },
    ],
    // Bloat fields that must be dropped:
    // (cast to unknown then back so the type-checker accepts the extras)
    ...({
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
      strokes: [{ type: 'SOLID' }],
      effects: [{ type: 'DROP_SHADOW' }],
      strokeWeight: 2,
      cornerRadius: 8,
      paint: { type: 'SOLID' },
      paints: [],
      backgroundColor: { r: 1, g: 1, b: 1, a: 1 },
      background: [{ type: 'SOLID' }],
      componentProperties: { variant: { value: 'default' } },
      componentPropertyDefinitions: {},
      componentPropertyReferences: {},
      styles: { fill: 'S:abc' },
      style: { fontFamily: 'Inter' },
      characters: 'Hello world',
      characterStyleOverrides: [],
      styleOverrideTable: {},
      layoutAlign: 'STRETCH',
      layoutGrow: 1,
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'HUG',
      constraints: { horizontal: 'LEFT', vertical: 'TOP' },
      clipsContent: true,
      blendMode: 'NORMAL',
      exportSettings: [],
      effectStyleId: 'S:abc',
      fillStyleId: 'S:def',
      strokeStyleId: 'S:ghi',
      gridStyleId: 'S:jkl',
    } as unknown as object),
    ...opts,
  } as FigmaNode;
}

// -----------------------------------------------------------------------------
// 1. trimFigmaTree(undefined) → null
// -----------------------------------------------------------------------------

Deno.test('trimFigmaTree returns null for undefined input', () => {
  const result = trimFigmaTree(undefined);
  assertStrictEquals(result, null);
});

// -----------------------------------------------------------------------------
// 2. allowlist behaviour — keeps named keys, drops bloat
// -----------------------------------------------------------------------------

Deno.test('trimFigmaTree keeps allowlisted keys', () => {
  const node = makeBloatedFrame('1:2');
  const trimmed = trimFigmaTree(node);
  assertExists(trimmed);
  // Kept keys
  assertEquals(trimmed!.id, '1:2');
  assertEquals(trimmed!.name, 'Frame 1:2');
  assertEquals(trimmed!.type, 'FRAME');
  assertEquals(trimmed!.absoluteBoundingBox?.width, 375);
  assert(Array.isArray(trimmed!.prototypeInteractions));
  // Dropped keys (sample a representative subset)
  const t = trimmed as unknown as Record<string, unknown>;
  assertStrictEquals(t.fills, undefined);
  assertStrictEquals(t.strokes, undefined);
  assertStrictEquals(t.effects, undefined);
  assertStrictEquals(t.paint, undefined);
  assertStrictEquals(t.paints, undefined);
  assertStrictEquals(t.backgroundColor, undefined);
  assertStrictEquals(t.componentProperties, undefined);
  assertStrictEquals(t.componentPropertyDefinitions, undefined);
  assertStrictEquals(t.styles, undefined);
  assertStrictEquals(t.style, undefined);
  assertStrictEquals(t.characters, undefined);
  assertStrictEquals(t.cornerRadius, undefined);
  assertStrictEquals(t.constraints, undefined);
  assertStrictEquals(t.clipsContent, undefined);
  assertStrictEquals(t.blendMode, undefined);
  assertStrictEquals(t.exportSettings, undefined);
  assertStrictEquals(t.effectStyleId, undefined);
  assertStrictEquals(t.fillStyleId, undefined);
});

// -----------------------------------------------------------------------------
// 3. recursion through children
// -----------------------------------------------------------------------------

Deno.test('trimFigmaTree recurses into children', () => {
  const child = makeBloatedFrame('1:11');
  const parent: FigmaNode = {
    id: '1:1',
    name: 'Parent',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 1000, height: 1000 },
    children: [child],
    // bloat on parent too
    ...({ fills: [{ type: 'SOLID' }] } as unknown as object),
  };
  const trimmed = trimFigmaTree(parent);
  assertExists(trimmed);
  assertEquals(trimmed!.children?.length, 1);
  const trimmedChild = trimmed!.children![0];
  assertEquals(trimmedChild!.id, '1:11');
  // child bloat is stripped
  const tc = trimmedChild as unknown as Record<string, unknown>;
  assertStrictEquals(tc.fills, undefined);
  // parent bloat is stripped
  const tp = trimmed as unknown as Record<string, unknown>;
  assertStrictEquals(tp.fills, undefined);
});

// -----------------------------------------------------------------------------
// 4. prototypeInteractions preserved verbatim (load-bearing for re-import remap)
// -----------------------------------------------------------------------------

Deno.test('trimFigmaTree preserves prototypeInteractions verbatim', () => {
  const node: FigmaNode = {
    id: '1:3',
    name: 'Button',
    type: 'INSTANCE',
    absoluteBoundingBox: { x: 10, y: 10, width: 100, height: 40 },
    prototypeInteractions: [
      {
        trigger: { type: 'ON_CLICK' },
        actions: [
          {
            type: 'NODE',
            destinationId: 'frame-target',
            transition: { type: 'SLIDE_FROM_RIGHT' },
          },
        ],
      },
      {
        trigger: { type: 'ON_HOVER' },
        actions: [{ type: 'NODE', destinationId: null, transition: null }],
      },
    ],
  };
  const trimmed = trimFigmaTree(node);
  assertExists(trimmed);
  // Deep-equal verbatim — same array contents
  assertEquals(
    JSON.stringify(trimmed!.prototypeInteractions),
    JSON.stringify(node.prototypeInteractions),
  );
});

// -----------------------------------------------------------------------------
// 5. idempotence — trim(trim(x)) ≡ trim(x)
// -----------------------------------------------------------------------------

Deno.test('trimFigmaTree is idempotent', () => {
  const child = makeBloatedFrame('1:11');
  const root = makeBloatedFrame('1:1', { children: [child] });
  const once = trimFigmaTree(root);
  const twice = trimFigmaTree(once as FigmaNode);
  assertEquals(JSON.stringify(twice), JSON.stringify(once));
});

// -----------------------------------------------------------------------------
// 6. trimFigmaDocument strips top-level components / componentSets / styles maps
// -----------------------------------------------------------------------------

Deno.test('trimFigmaDocument strips components / componentSets / styles maps', () => {
  const file = {
    name: 'My Test File',
    lastModified: '2026-05-16T12:00:00Z',
    document: makeBloatedFrame('0:0'),
    components: { a: { key: 'aaa', name: 'A', description: '' } },
    componentSets: { b: { key: 'bbb' } },
    styles: { 'S:abc': { key: 's-abc', styleType: 'FILL' } },
    schemaVersion: 1,
    version: '123456',
    mainFileKey: 'abc',
    branches: [],
    thumbnailUrl: 'https://example/thumb.png',
  } as unknown as FigmaFileResponse;

  const result = trimFigmaDocument(file);
  // Exactly three keys: name, lastModified, document.
  const keys = Object.keys(result).sort();
  assertEquals(keys, ['document', 'lastModified', 'name']);
  assertEquals(result.name, 'My Test File');
  assertEquals(result.lastModified, '2026-05-16T12:00:00Z');
  assertExists(result.document);
  // Document bloat also stripped
  const d = result.document as unknown as Record<string, unknown>;
  assertStrictEquals(d.fills, undefined);
});

// -----------------------------------------------------------------------------
// 7. round-trip through collectFrames
// -----------------------------------------------------------------------------

Deno.test('trimFigmaTree result is a valid input to collectFrames', () => {
  const frameA: FigmaNode = {
    id: '1:10',
    name: 'Home',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
    prototypeInteractions: [
      {
        trigger: { type: 'ON_CLICK' },
        actions: [{ type: 'NODE', destinationId: '1:20', transition: { type: 'DISSOLVE' } }],
      },
    ],
    ...({ fills: [{ type: 'SOLID' }] } as unknown as object),
  };
  const frameB: FigmaNode = {
    id: '1:20',
    name: 'Detail',
    type: 'FRAME',
    absoluteBoundingBox: { x: 400, y: 0, width: 375, height: 812 },
    ...({ effects: [{ type: 'DROP_SHADOW' }] } as unknown as object),
  };
  const canvas: FigmaNode = {
    id: '0:1',
    name: 'Page 1',
    type: 'CANVAS',
    children: [frameA, frameB],
  };
  const doc: FigmaNode = {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [canvas],
  };
  // collectFrames over raw doc
  const rawFrames = collectFrames(doc).map((f) => f.id);
  // collectFrames over trimmed doc
  const trimmed = trimFigmaTree(doc);
  assertExists(trimmed);
  const trimmedFrames = collectFrames(trimmed!).map((f) => f.id);
  assertEquals(trimmedFrames, rawFrames);
  assertEquals(trimmedFrames, ['1:10', '1:20']);
});
