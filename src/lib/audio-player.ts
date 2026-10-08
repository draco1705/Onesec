class AudioEngine {
  private context: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private activeSource: AudioBufferSourceNode | null = null;
  private activeGain: GainNode | null = null;

  public getContext(): AudioContext {
    if (!this.context) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new AudioCtx();
    }
    return this.context;
  }

  public async unlock(): Promise<void> {
    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
    } catch (e) {
      console.warn('AudioContext unlock note:', e);
    }
  }

  public stopAll(): void {
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {}
      this.activeSource = null;
    }
    if (this.activeGain) {
      try {
        this.activeGain.disconnect();
      } catch {}
      this.activeGain = null;
    }
  }

  public async loadAudio(url: string, id: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(id)) {
      return this.buffers.get(id)!;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} loading audio`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const ctx = this.getContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(id, audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.warn(`Failed to decode audio for track ${id}:`, error);
      return null;
    }
  }

  public getBuffer(id: string): AudioBuffer | undefined {
    return this.buffers.get(id);
  }

  public async playSlice(buffer: AudioBuffer, startSec: number, durationSec = 1.0): Promise<void> {
    try {
      await this.unlock();
      this.stopAll();

      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      this.activeSource = source;
      this.activeGain = gainNode;

      const startTime = ctx.currentTime;
      const totalDuration = buffer.duration;
      const safeDuration = Math.min(durationSec, Math.max(0.1, totalDuration));
      const safeStart = Math.max(
        0,
        Math.min(Number(startSec) || 0, Math.max(0, totalDuration - safeDuration))
      );

      const fadeOutStart = startTime + safeDuration - 0.015;

      gainNode.gain.setValueAtTime(1, startTime);
      gainNode.gain.setValueAtTime(1, Math.max(startTime, fadeOutStart));
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + safeDuration);

      source.start(startTime, safeStart, safeDuration);
      source.stop(startTime + safeDuration);
    } catch (error) {
      console.error('playSlice audio error:', error);
    }
  }
}

export const audioEngine = new AudioEngine();
