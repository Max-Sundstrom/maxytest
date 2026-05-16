/**
 * PrototypeViewer barrel — Plan 02-09 Task 2.
 *
 * Re-exports the three composable pieces of the runner's frame viewer so
 * PrototypeRunner can import everything from `./PrototypeViewer`.
 */
export { FrameLayer } from './FrameLayer';
export { HotspotOverlay } from './HotspotOverlay';
export { TransitionAnimator } from './TransitionAnimator';
export type { FrameShape, HotspotShape, FrameLayerProps } from './FrameLayer';
export type { HotspotOverlayProps } from './HotspotOverlay';
export type { TransitionKind, TransitionAnimatorProps } from './TransitionAnimator';
