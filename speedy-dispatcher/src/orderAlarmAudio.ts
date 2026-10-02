// AudioContext must be unlocked by a real user gesture. Never queue sounds in a
// suspended context: they could all play together after a later click.
export class OrderAlarmAudio {
  private context: AudioContext | null = null;
  private tones = new Set<OscillatorNode>();

  async unlock(onReady: (ready: boolean) => void) {
    try {
      const AudioCtx = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) { onReady(false); return; }
      if (!this.context || this.context.state === "closed") {
        this.context = new AudioCtx();
      }
      const context = this.context;
      context.onstatechange = () => onReady(context.state === "running");
      if (context.state !== "running") await context.resume();
      // A pending unlock may finish after logout/unmount.
      if (this.context === context) onReady(context.state === "running");
    } catch {
      onReady(false);
    }
  }

  play() {
    const context = this.context;
    if (!context || context.state !== "running") return false;
    this.stop();
    try {
      for (let index = 0; index < 3; index += 1) {
        const start = context.currentTime + index * 0.3;
        const tone = context.createOscillator();
        const gain = context.createGain();
        tone.type = "sine";
        tone.frequency.value = index === 1 ? 988 : 880;
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.23);
        tone.connect(gain);
        gain.connect(context.destination);
        this.tones.add(tone);
        tone.onended = () => {
          this.tones.delete(tone);
          tone.disconnect();
          gain.disconnect();
        };
        tone.start(start);
        tone.stop(start + 0.24);
      }
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop() {
    for (const tone of this.tones) {
      try { tone.stop(); } catch { /* Already stopped. */ }
      tone.disconnect();
    }
    this.tones.clear();
  }

  close() {
    this.stop();
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => {});
      this.context = null;
    }
  }
}
