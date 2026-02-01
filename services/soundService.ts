class SoundService {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.5;

  constructor() {
    try {
      // Restore settings
      const savedVol = localStorage.getItem('cruzpham_volume');
      const savedMute = localStorage.getItem('cruzpham_mute');
      
      if (savedVol !== null) this.volume = parseFloat(savedVol);
      if (savedMute !== null) this.isMuted = savedMute === 'true';

      const AudioCtor = (window.AudioContext || (window as any).webkitAudioContext);
      if (AudioCtor) {
        this.ctx = new AudioCtor();
      }
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  private getCtx() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  getVolume() { return this.volume; }
  getMute() { return this.isMuted; }

  setMute(mute: boolean) {
    this.isMuted = mute;
    localStorage.setItem('cruzpham_mute', String(mute));
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('cruzpham_volume', String(this.volume));
    // Play a test click to give feedback when sliding
    if (!this.isMuted && Math.random() > 0.8) this.playClick();
  }

  // --- HAPTICS ---
  vibrate(pattern: number | number[] = 10) {
    if (this.isMuted || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Silence errors if API is restricted by browser policy
    }
  }

  // --- SYNTHESIZERS ---

  // Soft UI Click (Navigation, generic buttons)
  playClick() {
    this.vibrate(5);
    if (this.isMuted || !this.getCtx()) return;
    const ctx = this.getCtx()!;
    const t = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    // High frequency sine blip, very short
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.05);
    
    gain.gain.setValueAtTime(this.volume * 0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // Tile Selection (Slightly more presence than click)
  playSelect() {
    this.vibrate(10);
    if (this.isMuted || !this.getCtx()) return;
    const ctx = this.getCtx()!;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    // Soft metallic pluck
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(300, t + 0.1);
    
    // Filter to soften the triangle wave
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.volume * 0.15, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Reveal Answer (Magical/Glassy Swell)
  playReveal() {
    this.vibrate([10, 30, 10]);
    if (this.isMuted || !this.getCtx()) return;
    const ctx = this.getCtx()!;
    const t = ctx.currentTime;

    // A shimmering chord
    const freqs = [523.25, 783.99, 1046.50, 1318.51]; // C Major 7ish
    
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * 0.08, t + 0.1 + (i*0.05));
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.0);
    });

    // Underlying "Whoosh" (White noise filtered)
    const bufferSize = ctx.sampleRate * 0.5; // 0.5 sec
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(200, t);
    noiseFilter.frequency.linearRampToValueAtTime(1200, t + 0.4);
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(this.volume * 0.05, t);
    noiseGain.gain.linearRampToValueAtTime(0, t + 0.4);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);
  }

  // Points Awarded (Positive/Success Chime)
  playAward() {
    this.vibrate(20);
    if (this.isMuted || !this.getCtx()) return;
    const ctx = this.getCtx()!;
    const t = ctx.currentTime;

    // Ascending Arpeggio
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;

      gain.gain.setValueAtTime(0, t + (i*0.06));
      gain.gain.linearRampToValueAtTime(this.volume * 0.1, t + (i*0.06) + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (i*0.06) + 0.4);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(t);
      osc.stop(t + 1.5);
    });
  }

  // Steal Points (Tense/Suspense)
  playSteal() {
    this.vibrate([15, 5, 15]);
    if (this.isMuted || !this.getCtx()) return;
    const ctx = this.getCtx()!;
    const t = ctx.currentTime;
    
    // Diminished/Dissonant
    [300, 360, 420].forEach((freq, i) => { 
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq - 20, t + 0.5); // Pitch bend down slightly
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, t);
      filter.frequency.linearRampToValueAtTime(100, t + 0.5);

      gain.gain.setValueAtTime(this.volume * 0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  // Void/Error (Low Thud)
  playVoid() {
    this.vibrate(30);
    if (this.isMuted || !this.getCtx()) return;
    const ctx = this.getCtx()!;
    const t = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    
    // Lowpass to make it a "thud" rather than "buzz"
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    gain.gain.setValueAtTime(this.volume * 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Double Or Nothing (Fanfare)
  playDoubleOrNothing() {
    this.vibrate([10, 10, 10, 10, 10]);
    if (this.isMuted || !this.getCtx()) return;
    const ctx = this.getCtx()!;
    const t = ctx.currentTime;
    
    // Rapid triplet fanfare
    [523.25, 698.46, 783.99, 1046.50].forEach((freq, i) => {
      const startTime = t + (i * 0.08);
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(this.volume * 0.15, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });
  }

  // --- TIMER SOUNDS ---

  playTimerTick() {
    if (this.isMuted || !this.getCtx()) return;
    const ctx = this.getCtx()!;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    
    gain.gain.setValueAtTime(this.volume * 0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  playTimerAlarm() {
    this.vibrate([100, 50, 100]);
    if (this.isMuted || !this.getCtx()) return;
    const ctx = this.getCtx()!;
    const t = ctx.currentTime;

    // Double beep
    [0, 0.2].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, t + offset);
      osc.frequency.linearRampToValueAtTime(300, t + offset + 0.15);

      gain.gain.setValueAtTime(this.volume * 0.2, t + offset);
      gain.gain.linearRampToValueAtTime(0, t + offset + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.2);
    });
  }

  // --- TOAST FEEDBACK ---
  
  playToast(type: 'success' | 'error' | 'info') {
    if (this.isMuted || !this.getCtx()) return;
    const ctx = this.getCtx()!;
    const t = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    if (type === 'success') {
      this.vibrate(5);
      // Gentle High Ping
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * 0.05, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    } else if (type === 'error') {
      this.vibrate(20);
      // Soft Buzzer
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.linearRampToValueAtTime(100, t + 0.3);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      osc.disconnect();
      osc.connect(filter);
      filter.connect(gain);
      
      gain.gain.setValueAtTime(this.volume * 0.1, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.3);
    } else {
      // Info - Bubbles
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.linearRampToValueAtTime(800, t + 0.1);
      gain.gain.setValueAtTime(this.volume * 0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    }
    
    if (type !== 'error') { // Error already connected via filter
      osc.connect(gain);
    }
    gain.connect(ctx.destination);
    
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

export const soundService = new SoundService();