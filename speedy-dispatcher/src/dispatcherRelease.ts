import { API_V1_BASE_URL } from './apiConfig';
import { ReleaseController } from './releaseController';

declare const __DISPATCHER_RELEASE__: string;
export const dispatcherRelease = new ReleaseController({
  current: __DISPATCHER_RELEASE__,
  storage: window.sessionStorage,
  async read() {
    const response = await fetch(`/dispatcher-version.json?check=${Date.now()}`, {
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()).release;
  },
  navigate(release) {
    const url = new URL(window.location.href);
    url.searchParams.set('dispatcher-release', release);
    window.location.replace(url.href);
  },
});

// Track writes even if their screen unmounts. A lost response may represent a
// successful server save, so hold automatic reload for the rest of that session.
export function installReleaseWriteTracking() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!url.href.startsWith(`${API_V1_BASE_URL}/`) || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return original(input, init);
    dispatcherRelease.startWrite();
    try {
      const response = await original(input, init);
      // Include body transfer, not just the response headers, in the write guard.
      const copy = response.clone();
      const body = copy.headers.get('content-type')?.includes('json') && copy.status !== 204
        ? copy.json() : copy.arrayBuffer();
      void body.then(
        () => dispatcherRelease.endWrite(response.status >= 500),
        () => dispatcherRelease.endWrite(true),
      );
      return response;
    } catch (error) { dispatcherRelease.endWrite(true); throw error; }
  };
}
