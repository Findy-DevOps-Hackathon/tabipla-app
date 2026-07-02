const DEFAULT_BAR_COUNT = 5;
const NOISE_FLOOR = 0.018;
const RMS_GAIN = 10;

/** 0〜1 にクランプし、小さい声でも動きやすいようゲインをかける。 */
function amplifyLevel(raw: number, gain = 1): number {
  const boosted = Math.max(0, raw - NOISE_FLOOR) * gain;
  return Math.min(1, boosted);
}

/** マイク入力の振幅をバー数分のレベル（0〜1）で返すモニター。 */
export class AudioLevelMonitor {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId = 0;
  private readonly barCount: number;
  private onLevels: ((levels: number[]) => void) | null = null;
  private fakePhase = 0;

  constructor(barCount = DEFAULT_BAR_COUNT) {
    this.barCount = barCount;
  }

  async start(
    onLevels: (levels: number[]) => void,
    options?: { useHardware?: boolean },
  ): Promise<boolean> {
    this.onLevels = onLevels;
    const useHardware = options?.useHardware ?? true;

    if (!useHardware || !navigator.mediaDevices?.getUserMedia) {
      this.startFakeAnimation();
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.context = new AudioContext();
      await this.context.resume();

      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.35;
      source.connect(this.analyser);

      this.tick();
      return true;
    } catch {
      this.cleanupHardware();
      this.startFakeAnimation();
      return false;
    }
  }

  stop() {
    cancelAnimationFrame(this.rafId);
    this.cleanupHardware();
    this.onLevels = null;
    this.fakePhase = 0;
  }

  private tick = () => {
    if (!this.analyser || !this.onLevels) return;

    const timeData = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(timeData);

    let sumSquares = 0;
    for (let i = 0; i < timeData.length; i++) {
      const sample = ((timeData[i] ?? 128) - 128) / 128;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / timeData.length);
    const volume = amplifyLevel(rms, RMS_GAIN);

    const freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(freqData);

    const levels: number[] = [];
    const step = Math.max(1, Math.floor(freqData.length / this.barCount));
    for (let i = 0; i < this.barCount; i++) {
      let bandSum = 0;
      const start = i * step;
      const end = Math.min(freqData.length, start + step);
      for (let j = start; j < end; j++) bandSum += freqData[j] ?? 0;
      const band = bandSum / ((end - start) * 255);
      levels.push(amplifyLevel(band * 0.55 + volume * 0.75, 1.2));
    }

    this.onLevels(levels);
    this.rafId = requestAnimationFrame(this.tick);
  };

  /** マイク解析が使えない場合の控えめな疑似波形。 */
  private startFakeAnimation = () => {
    const animate = () => {
      if (!this.onLevels) return;
      this.fakePhase += 0.14;
      const pulse = Math.sin(this.fakePhase) * 0.5 + 0.5;
      const levels = Array.from({ length: this.barCount }, (_, i) => {
        const wave = Math.sin(this.fakePhase + i * 0.85) * 0.5 + 0.5;
        return 0.08 + pulse * wave * 0.25;
      });
      this.onLevels(levels);
      this.rafId = requestAnimationFrame(animate);
    };
    animate();
  };

  private cleanupHardware() {
    this.stream?.getTracks().forEach((track) => {
      track.stop();
    });
    void this.context?.close();
    this.stream = null;
    this.context = null;
    this.analyser = null;
  }
}

export const AUDIO_LEVEL_BAR_COUNT = DEFAULT_BAR_COUNT;

export function emptyAudioLevels(barCount = DEFAULT_BAR_COUNT): number[] {
  return Array.from({ length: barCount }, () => 0);
}
