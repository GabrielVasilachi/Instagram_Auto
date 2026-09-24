import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './Theme';
import LandingPage from './landing/LandingPage';
import './styles.css';
import './appearance.css';

const App = lazy(() => import('./App'));
const studioPages = new Set([
  'overview',
  'planner',
  'studio',
  'library',
  'analytics',
  'settings',
  'calendar',
  'automation',
]);
function isStudioRoute() {
  return (
    window.location.pathname.replace(/\/$/, '') !== '' ||
    studioPages.has(window.location.hash.slice(1))
  );
}
function Root() {
  const [showStudio, setShowStudio] = useState(isStudioRoute);
  useEffect(() => {
    const updateRoute = () => setShowStudio(isStudioRoute());
    window.addEventListener('hashchange', updateRoute);
    window.addEventListener('popstate', updateRoute);
    return () => {
      window.removeEventListener('hashchange', updateRoute);
      window.removeEventListener('popstate', updateRoute);
    };
  }, []);
  useEffect(() => {
    const section = !showStudio && document.getElementById(window.location.hash.slice(1));
    if (section) section.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [showStudio]);
  return showStudio ? (
    <ThemeProvider>
      <Suspense
        fallback={
          <main className="splash" aria-busy="true">
            Se deschide studioul…
          </main>
        }
      >
        <App />
      </Suspense>
    </ThemeProvider>
  ) : (
    <LandingPage />
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
