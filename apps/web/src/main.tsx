import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';

// Self-hosted IBM Plex pair per design-system v1
// (.planning/design-system/handoff-v1/README.md §Typography).
// @fontsource CSS imports register @font-face rules; Tailwind's `font-sans`
// utility (mapped to --font-sans in tokens.css) picks them up.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

import './styles/globals.css';

import { initSkin } from './lib/stores/prefs';
import { routeTree } from './routeTree.gen';

// Apply the persisted design-system skin (paper / white / dark) to
// <html data-skin="…"> before React mounts, so the first paint already
// matches the user's saved choice. See lib/stores/prefs.ts.
initSkin();

// TanStack Router instance.
// `defaultPreload: 'intent'` prefetches route data on hover/focus — eliminates
// the most common cause of layout shift on click.
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

// Type augmentation — gives `<Link to="..." />` and `useNavigate({ to })`
// compile-time path checking across the app.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
