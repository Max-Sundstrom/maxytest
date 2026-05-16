/**
 * Pure regex parser for Figma share links.
 *
 * Accepts the three URL flavors Figma exposes:
 *   - `https://www.figma.com/proto/{file_key}/{slug}?node-id=...&starting-point-node-id=...`
 *   - `https://www.figma.com/design/{file_key}/{slug}`
 *   - `https://www.figma.com/file/{file_key}/{slug}` (legacy)
 *
 * `file_key` is a 22-128 character alphanumeric token. Query params
 * `starting-point-node-id` and `node-id` are extracted via the WHATWG URL
 * parser when present.
 *
 * Returns `null` on any malformed input (non-Figma host, short file_key,
 * unparseable URL). Never throws — T-02-01-02 mitigation: malformed input
 * cannot leak stack traces to the user UI.
 *
 * Source: medium.com/@zyumbik/validating-figma-links-71e143451d95
 * (cited RESEARCH.md "Don't Hand-Roll").
 */

export interface ParsedFigmaShareLink {
  file_key: string;
  starting_point_node_id?: string;
  node_id?: string;
}

// Community regex: figma.com (any subdomain), one of proto|design|file,
// then a 22-128 char alphanumeric file_key. Optional `/<slug>` and `?query`.
const FIGMA_URL_RE =
  /https:\/\/[\w.-]+\.?figma\.com\/(proto|design|file)\/([0-9a-zA-Z]{22,128})(?:\/[^?]*)?(\?.*)?$/;

export function parseFigmaShareLink(url: string): ParsedFigmaShareLink | null {
  const match = FIGMA_URL_RE.exec(url);
  if (!match) return null;

  const file_key = match[2];

  // Extract query params via WHATWG URL — wrapped in try/catch because
  // `new URL(url)` throws TypeError on malformed input. The regex already
  // accepted the shape, but be defensive: pathological inputs (e.g., embedded
  // null bytes) can still fail URL parsing.
  let starting_point_node_id: string | undefined;
  let node_id: string | undefined;
  try {
    const parsed = new URL(url);
    starting_point_node_id = parsed.searchParams.get('starting-point-node-id') ?? undefined;
    node_id = parsed.searchParams.get('node-id') ?? undefined;
  } catch {
    return null;
  }

  return { file_key, starting_point_node_id, node_id };
}
