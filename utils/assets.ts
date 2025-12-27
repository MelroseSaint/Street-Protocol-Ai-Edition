import * as THREE from 'three';

// Procedural Texture Generator
export const createTexture = (type: 'grid' | 'asphalt' | 'building' | 'grass'): THREE.Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  if (type === 'grid') {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=0; i<=512; i+=64) {
      ctx.moveTo(i, 0); ctx.lineTo(i, 512);
      ctx.moveTo(0, i); ctx.lineTo(512, i);
    }
    ctx.stroke();
  } else if (type === 'asphalt') {
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, 512, 512);
    // Noise
    for(let i=0; i<5000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#444' : '#222';
        ctx.fillRect(Math.random()*512, Math.random()*512, 2, 2);
    }
  } else if (type === 'grass') {
    ctx.fillStyle = '#2d4c1e';
    ctx.fillRect(0, 0, 512, 512);
    for(let i=0; i<10000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#3a5f25' : '#1f3812';
        ctx.fillRect(Math.random()*512, Math.random()*512, 2, 4);
    }
  } else if (type === 'building') {
    ctx.fillStyle = '#555';
    ctx.fillRect(0, 0, 512, 512);
    // Windows
    ctx.fillStyle = '#8ab'; // Window color (off)
    const windowSize = 30;
    const gap = 20;
    for(let x=gap; x<512; x+=windowSize+gap) {
        for(let y=gap; y<512; y+=windowSize+gap) {
            if (Math.random() > 0.3) {
                 ctx.fillStyle = Math.random() > 0.9 ? '#ffeb3b' : '#112'; // Lit or dark
                 ctx.fillRect(x, y, windowSize, windowSize);
            }
        }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

// Simple Synth Audio Manager
export class SoundManager {
  ctx: AudioContext;
  engineOsc: OscillatorNode | null = null;
  engineGain: GainNode | null = null;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  startEngineSound() {
    if (this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineGain = this.ctx.createGain();
    
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 100;
    this.engineGain.gain.value = 0.05;

    // Lowpass filter for muffling
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    
    this.engineOsc.start();
  }

  updateEngineRPM(speed: number) {
    if (this.engineOsc && this.engineGain) {
      // Map speed 0-50 to freq 60-300
      const targetFreq = 60 + (Math.abs(speed) * 10);
      this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
      
      // Volume based on load? Just keep constant low rumble for now, maybe louder at speed
      this.engineGain.gain.setTargetAtTime(0.05 + (Math.min(Math.abs(speed)/100, 0.1)), this.ctx.currentTime, 0.1);
    }
  }

  stopEngineSound() {
    if (this.engineOsc) {
      this.engineOsc.stop();
      this.engineOsc.disconnect();
      this.engineOsc = null;
    }
  }
}