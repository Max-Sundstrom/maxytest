import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';

// Self-hosted Inter (weights 400/500/600/700) per UI-SPEC §Typography.
// @fontsource CSS imports register @font-face rules; Tailwind's `font-sans`
// utility (mapped to --font-sans in tokens.css) then picks Inter up.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';

import './styles/globals.css';

import { routeTree } from './routeTree.gen';

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
