import { useEffect, useSyncExternalStore } from 'react';
import { dispatcherRelease } from './dispatcherRelease';

export function DispatcherUpdate({ signedIn }: { signedIn: boolean }) {
  const revision = useSyncExternalStore(dispatcherRelease.subscribe, dispatcherRelease.snapshot);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      clearTimeout(timer);
      const editing = document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
      if (!signedIn || !dispatcherRelease.canReload() || document.hidden || editing) return;
      timer = setTimeout(() => {
        if (dispatcherRelease.canReload() && !document.hidden) dispatcherRelease.reload();
      }, 10000);
    }
    const events = ['pointerdown', 'keydown', 'focusin', 'focusout', 'visibilitychange'];
    events.forEach(event => document.addEventListener(event, schedule));
    schedule();
    return () => { clearTimeout(timer); events.forEach(event => document.removeEventListener(event, schedule)); };
  }, [signedIn, revision]);
  if (!dispatcherRelease.pending) return null;
  return <aside role="status" className="border border-amber-500 bg-amber-950 p-4 text-amber-100">
    <strong>Dispatcher update ready.</strong>{' '}
    {dispatcherRelease.loopStopped
      ? 'The new page could not load automatically. Save your work, then use Ctrl+Shift+R or contact the administrator.'
      : !signedIn
        ? 'Select Login to load the new page before signing in.'
      : dispatcherRelease.deferred || dispatcherRelease.uncertainWrite
        ? 'Automatic refresh is paused for this session. Finish your work, then log out and log in to load the update.'
        : 'Finish or cancel your work, then return to Live Orders. When no work is pending, this tab will return to sign-in after 10 seconds without activity and load the new page.'}
    {signedIn && !dispatcherRelease.deferred && <button type="button" onClick={() => dispatcherRelease.defer()} className="ml-3 rounded border px-3 py-1">Keep working</button>}
  </aside>;
}
