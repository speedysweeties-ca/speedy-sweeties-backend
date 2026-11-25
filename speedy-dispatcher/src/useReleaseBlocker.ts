import { useLayoutEffect, useState } from 'react';
import { dispatcherRelease } from './dispatcherRelease';

export function useReleaseBlocker(blocked: boolean) {
  const [key] = useState(() => Symbol('unfinished dispatcher work'));
  useLayoutEffect(() => {
    dispatcherRelease.block(key, blocked);
    return () => dispatcherRelease.block(key, false);
  }, [key, blocked]);
}
