class AudioEngine {
  private context: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  public getContext(): AudioContext {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return this.context;
  }

  public unlock() {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  public async loadAudio(url: string, id: string): Promise<void> {
    if (this.buffers.has(id)) return;
    
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const ctx = this.getContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(id, audioBuffer);
    } catch (error) {
      console.error('Failed to load audio:', error);
      throw error;
    }
  }

  public getBuffer(id: string): AudioBuffer | undefined {
    return this.buffers.get(id);
  }

  public playSlice(buffer: AudioBuffer, startSec: number, durationSec = 0.5): void {
    const ctx = this.getContext();
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    
    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    const startTime = ctx.currentTime;
    const fadeOutStart = startTime + durationSec - 0.015;

    gainNode.gain.setValueAtTime(1, startTime);
    gainNode.gain.setValueAtTime(1, fadeOutStart);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

    source.start(startTime, startSec, durationSec);
    source.stop(startTime + durationSec);
  }
}

export const audioEngine = new AudioEngine();
