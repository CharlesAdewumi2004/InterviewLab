import { useCallback, useEffect, useState } from 'react';

// Hash routing on purpose: the Fastify static server has no SPA fallback, so
// history-API routes would 404 on refresh — #/routes never hit the server.
export type Route = 'home' | 'practice' | 'design' | 'oop' | 'tech' | 'behavioral' | 'progress' | 'setup';

const ROUTES: Route[] = ['home', 'practice', 'design', 'oop', 'tech', 'behavioral', 'progress', 'setup'];

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'home';
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parse);

  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = r === 'home' ? '/' : `/${r}`;
  }, []);

  return [route, navigate];
}
