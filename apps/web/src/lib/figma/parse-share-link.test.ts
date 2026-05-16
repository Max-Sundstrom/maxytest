/**
 * `parseFigmaShareLink` unit tests — Plan 02-01 Task 2.
 *
 * Locks the regex contract from PATTERNS.md "Medium Analogs" + RESEARCH.md
 * "Don't Hand-Roll": community regex covers /proto, /design, /file URL flavors
 * with a 22-128 char alphanumeric `file_key` and pulls `starting-point-node-id`
 * + `node-id` query params via the WHATWG URL parser.
 *
 * Pure function — no mocks required. Wires no I/O.
 */

import { describe, expect, it } from 'vitest';
import { parseFigmaShareLink } from './parse-share-link';

describe('parseFigmaShareLink', () => {
  it('parses /proto URL with both starting-point-node-id and node-id query params', () => {
    const result = parseFigmaShareLink(
      'https://www.figma.com/proto/abc123XYZdef456ghi789jk/Page-Name?node-id=4-2&starting-point-node-id=5-3',
    );
    expect(result).toEqual({
      file_key: 'abc123XYZdef456ghi789jk',
      starting_point_node_id: '5-3',
      node_id: '4-2',
    });
  });

  it('parses /design URL with no query params (node ids are undefined)', () => {
    const result = parseFigmaShareLink('https://www.figma.com/design/abc123XYZdef456ghi789jk/Page');
    expect(result).toEqual({
      file_key: 'abc123XYZdef456ghi789jk',
      starting_point_node_id: undefined,
      node_id: undefined,
    });
  });

  it('parses legacy /file URL flavor (RESEARCH.md line 69)', () => {
    const result = parseFigmaShareLink('https://www.figma.com/file/abc123XYZdef456ghi789jk/Page');
    expect(result).not.toBeNull();
    expect(result?.file_key).toBe('abc123XYZdef456ghi789jk');
  });

  it('returns null for a non-Figma URL', () => {
    expect(parseFigmaShareLink('https://example.com/not-figma')).toBeNull();
  });

  it('returns null for a string that is not a URL at all (no throw)', () => {
    // The function MUST wrap `new URL(...)` in try/catch and never throw
    // (T-02-01-02 — malformed input must not leak stack traces).
    expect(() => parseFigmaShareLink('not a url at all')).not.toThrow();
    expect(parseFigmaShareLink('not a url at all')).toBeNull();
  });

  it('returns null when file_key is shorter than the 22-char regex minimum', () => {
    expect(parseFigmaShareLink('https://www.figma.com/proto/short')).toBeNull();
  });
});
