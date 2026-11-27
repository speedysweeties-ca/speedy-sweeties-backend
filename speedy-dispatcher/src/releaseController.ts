export const RELEASE_LOGIN_KEY = 'dispatcher-release-login';
const ATTEMPT_KEY = 'dispatcher-release-attempt';
export const validRelease = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

type Options = {
  current: string;
  read: () => Promise<unknown>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  navigate: (release: string) => void;
  now?: () => number;
};

// No polling timer: checks are triggered by login or a changed API response.
export class ReleaseController {
  pending: string | null = null;
  blocked = new Set<symbol>();
  writes = 0;
  uncertainWrite = false;
  deferred = false;
  loopStopped = false;
  private revision = 0;
  private listeners = new Set<() => void>();
  private checking: Promise<void> | null = null;
  private lastCheck = -Infinity;
  private options: Options;
  constructor(options: Options) { this.options = options; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  changed() { this.revision++; this.listeners.forEach(listener => listener()); }
  block(key: symbol, value: boolean) {
    if (this.blocked.has(key) === value) return;
    if (value) this.blocked.add(key); else this.blocked.delete(key);
    this.changed();
  }
  startWrite() { this.writes++; this.changed(); }
  endWrite(uncertain: boolean) { this.writes--; this.uncertainWrite ||= uncertain; this.changed(); }
  defer() { this.deferred = true; this.changed(); }
  canReload() { return !!this.pending && !this.blocked.size && !this.writes && !this.uncertainWrite && !this.deferred && !this.loopStopped; }
  observe(hint: string | null) {
    if (!validRelease(hint) || (hint === this.options.current && !this.pending)) return;
    const now = (this.options.now ?? Date.now)();
    if (now - this.lastCheck >= 30000) void this.check();
  }
  check(): Promise<void> {
    if (this.checking) return this.checking;
    this.lastCheck = (this.options.now ?? Date.now)();
    this.checking = (async () => {
      try {
        const release = await this.options.read();
        if (!validRelease(release)) return;
        // A rollback to this build cancels a previously announced update.
        const pending = release === this.options.current ? null : release;
        if (pending !== this.pending) { this.pending = pending; this.changed(); }
      } catch { /* Offline/failed checks must not sign anyone out. */ }
      finally { this.checking = null; }
    })();
    return this.checking;
  }
  reload() {
    if (!this.pending || this.loopStopped) return false;
    try {
      const attempt = `${this.options.current}:${this.pending}`;
      if (this.options.storage.getItem(ATTEMPT_KEY) === attempt) {
        this.loopStopped = true; this.changed(); return false;
      }
      this.options.storage.setItem(ATTEMPT_KEY, attempt);
      // Per-tab sign-in gate: another tab may still contain an unfinished order.
      // Do not revoke accounts or delete the token shared by those tabs.
      this.options.storage.setItem(RELEASE_LOGIN_KEY, '1');
    } catch { this.loopStopped = true; this.changed(); return false; }
    this.options.navigate(this.pending);
    return true;
  }
}
