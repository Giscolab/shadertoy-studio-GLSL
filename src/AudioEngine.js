/**
 * AudioEngine.js — Shader Studio v4
 * ──────────────────────────────────
 * Gestion complète de l'audio :
 *  - Chargement fichier MP3/WAV/OGG
 *  - Microphone
 *  - Analyse fréquentielle : bass / mid / high
 *  - Gain indépendant par bande
 *  - Smooth (lissage configurable)
 *  - Détection de beat (BPM)
 *  - Callbacks onBeat
 */

export class AudioEngine {
    constructor() {
        this.ctx         = null;   // AudioContext
        this.source      = null;   // BufferSourceNode ou MediaStreamSourceNode
        this.gainNode    = null;   // Gain global
        this.analyser    = null;   // AnalyserNode (full spectrum)
        this.dataArray   = null;   // Uint8Array FFT

        // Filtres bandes
        this.bassFilter  = null;
        this.midFilter   = null;
        this.highFilter  = null;

        // Analyseurs par bande
        this.bassAnalyser = null;
        this.midAnalyser  = null;
        this.highAnalyser = null;

        this.bassData    = null;
        this.midData     = null;
        this.highData    = null;

        // Valeurs courantes (0.0 – 1.0 lissées)
        this.values = {
            bass:    0,
            mid:     0,
            high:    0,
            overall: 0,
        };

        // Gains indépendants par bande (multiplicateurs)
        this.gains = {
            bass:    1.0,
            mid:     1.0,
            high:    1.0,
            overall: 1.0,
        };

        // Lissage (0 = instantané, 0.95 = très lisse)
        this.smoothing = {
            bass:    0.75,
            mid:     0.70,
            high:    0.65,
            overall: 0.80,
        };

        // Sensibilité (seuil de normalisation)
        this.sensitivity = 1.0;

        // Playliste / état lecteur
        this.audioBuffer  = null;  // AudioBuffer chargé
        this.isPlaying    = false;
        this.isPaused     = false;
        this.pauseOffset  = 0;
        this.startTime    = 0;
        this.duration     = 0;
        this.fileName     = '';

        // Beat detection
        this.beatThreshold   = 0.6;   // seuil déclenchement beat
        this.beatCooldown    = 250;   // ms minimum entre beats
        this._lastBeat       = 0;
        this._beatHistory    = new Array(20).fill(0);
        this._beatHistIdx    = 0;
        this.bpm             = 0;
        this._bpmTimestamps  = [];

        // Source = 'file' | 'mic' | null
        this.sourceType = null;

        // Callbacks
        this.onBeat      = null;   // () => void
        this.onBPMUpdate = null;   // (bpm: number) => void
        this.onEnded     = null;   // () => void
        this.onTimeUpdate= null;   // (currentTime, duration) => void
    }

    // ── Initialisation AudioContext ─────────────────────────────────────────

    _ensureContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    _buildGraph(sourceNode) {
        const ctx = this.ctx;

        // Gain master
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = this.gains.overall;

        // Analyseur global (FFT 2048)
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

        // ── Filtre BASS (< 250 Hz) ──
        this.bassFilter = ctx.createBiquadFilter();
        this.bassFilter.type = 'lowpass';
        this.bassFilter.frequency.value = 250;
        this.bassFilter.Q.value = 0.8;

        this.bassAnalyser = ctx.createAnalyser();
        this.bassAnalyser.fftSize = 256;
        this.bassAnalyser.smoothingTimeConstant = 0.85;
        this.bassData = new Uint8Array(this.bassAnalyser.frequencyBinCount);

        // ── Filtre MID (250 Hz – 4 kHz) ──
        this.midFilter = ctx.createBiquadFilter();
        this.midFilter.type = 'bandpass';
        this.midFilter.frequency.value = 1200;
        this.midFilter.Q.value = 0.5;

        this.midAnalyser = ctx.createAnalyser();
        this.midAnalyser.fftSize = 256;
        this.midAnalyser.smoothingTimeConstant = 0.75;
        this.midData = new Uint8Array(this.midAnalyser.frequencyBinCount);

        // ── Filtre HIGH (> 4 kHz) ──
        this.highFilter = ctx.createBiquadFilter();
        this.highFilter.type = 'highpass';
        this.highFilter.frequency.value = 4000;
        this.highFilter.Q.value = 0.8;

        this.highAnalyser = ctx.createAnalyser();
        this.highAnalyser.fftSize = 256;
        this.highAnalyser.smoothingTimeConstant = 0.65;
        this.highData = new Uint8Array(this.highAnalyser.frequencyBinCount);

        // ── Connexions ──
        // Source → gain → analyseur global → sortie
        sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.analyser);
        this.analyser.connect(ctx.destination);

        // Source → filtres → analyseurs par bande (parallel, sans sortie audio)
        sourceNode.connect(this.bassFilter);
        this.bassFilter.connect(this.bassAnalyser);

        sourceNode.connect(this.midFilter);
        this.midFilter.connect(this.midAnalyser);

        sourceNode.connect(this.highFilter);
        this.highFilter.connect(this.highAnalyser);
    }

    // ── Chargement fichier ──────────────────────────────────────────────────

    async loadFile(file) {
        this._ensureContext();
        this.stop();

        this.fileName = file.name;
        const arrayBuffer = await file.arrayBuffer();
        this.audioBuffer  = await this.ctx.decodeAudioData(arrayBuffer);
        this.duration     = this.audioBuffer.duration;
        this.sourceType   = 'file';
        this.isPaused     = false;
        this.pauseOffset  = 0;

        return this.audioBuffer;
    }

    play() {
        if (!this.audioBuffer || this.isPlaying) return;
        this._ensureContext();

        const node = this.ctx.createBufferSource();
        node.buffer = this.audioBuffer;
        node.loop   = false;
        node.onended = () => {
            if (!this.isPaused) {
                this.isPlaying = false;
                this.pauseOffset = 0;
                if (this.onEnded) this.onEnded();
            }
        };

        this._buildGraph(node);
        node.start(0, this.pauseOffset);

        this.source    = node;
        this.startTime = this.ctx.currentTime - this.pauseOffset;
        this.isPlaying = true;
        this.isPaused  = false;
    }

    pause() {
        if (!this.isPlaying) return;
        this.pauseOffset = this.ctx.currentTime - this.startTime;
        this.isPaused    = true;
        this.isPlaying   = false;
        this.source?.stop();
    }

    stop() {
        try { this.source?.stop(); } catch(e){}
        this.isPlaying   = false;
        this.isPaused    = false;
        this.pauseOffset = 0;
    }

    seek(t) {
        const wasPlaying = this.isPlaying;
        this.stop();
        this.pauseOffset = Math.max(0, Math.min(t, this.duration));
        if (wasPlaying) this.play();
    }

    getCurrentTime() {
        if (!this.ctx) return 0;
        if (this.isPlaying) return this.ctx.currentTime - this.startTime;
        return this.pauseOffset;
    }

    setVolume(v) {
        this.gains.overall = v;
        if (this.gainNode) this.gainNode.gain.value = v;
    }

    // ── Microphone ──────────────────────────────────────────────────────────

    async startMic() {
        this._ensureContext();
        this.stop();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const srcNode = this.ctx.createMediaStreamSource(stream);
        this._buildGraph(srcNode);
        this.source     = srcNode;
        this.sourceType = 'mic';
        this.isPlaying  = true;
        this._micStream = stream;
    }

    stopMic() {
        if (this._micStream) {
            this._micStream.getTracks().forEach(t => t.stop());
            this._micStream = null;
        }
        this.isPlaying  = false;
        this.sourceType = null;
    }

    // ── Analyse (appelée chaque frame) ─────────────────────────────────────

    update() {
        if (!this.analyser) {
            // Pas de source — valeurs à 0 avec décroissance douce
            ['bass','mid','high','overall'].forEach(b => {
                this.values[b] *= 0.9;
            });
            return;
        }

        // Global
        this.analyser.getByteFrequencyData(this.dataArray);
        const rawOverall = this._average(this.dataArray) / 255;
        this.values.overall = this._smooth(this.values.overall, rawOverall * this.gains.overall * this.sensitivity, this.smoothing.overall);

        // Bass
        this.bassAnalyser.getByteFrequencyData(this.bassData);
        const rawBass = this._average(this.bassData) / 255;
        this.values.bass = this._smooth(this.values.bass, rawBass * this.gains.bass * this.sensitivity, this.smoothing.bass);

        // Mid
        this.midAnalyser.getByteFrequencyData(this.midData);
        const rawMid = this._average(this.midData) / 255;
        this.values.mid = this._smooth(this.values.mid, rawMid * this.gains.mid * this.sensitivity, this.smoothing.mid);

        // High
        this.highAnalyser.getByteFrequencyData(this.highData);
        const rawHigh = this._average(this.highData) / 255;
        this.values.high = this._smooth(this.values.high, rawHigh * this.gains.high * this.sensitivity, this.smoothing.high);

        // Beat detection (sur la bass)
        this._detectBeat(rawBass);

        // Callback temps
        if (this.isPlaying && this.sourceType === 'file' && this.onTimeUpdate) {
            this.onTimeUpdate(this.getCurrentTime(), this.duration);
        }
    }

    // ── Beat detection ──────────────────────────────────────────────────────

    _detectBeat(rawBass) {
        const now = performance.now();

        this._beatHistory[this._beatHistIdx] = rawBass;
        this._beatHistIdx = (this._beatHistIdx + 1) % this._beatHistory.length;

        const avg = this._beatHistory.reduce((a,b) => a+b, 0) / this._beatHistory.length;

        if (rawBass > avg * 1.5 && rawBass > this.beatThreshold && (now - this._lastBeat) > this.beatCooldown) {
            this._lastBeat = now;

            // BPM estimation
            this._bpmTimestamps.push(now);
            if (this._bpmTimestamps.length > 12) this._bpmTimestamps.shift();
            if (this._bpmTimestamps.length >= 4) {
                const intervals = [];
                for (let i = 1; i < this._bpmTimestamps.length; i++) {
                    intervals.push(this._bpmTimestamps[i] - this._bpmTimestamps[i-1]);
                }
                const avgInterval = intervals.reduce((a,b)=>a+b,0)/intervals.length;
                this.bpm = Math.round(60000 / avgInterval);
                if (this.onBPMUpdate) this.onBPMUpdate(this.bpm);
            }

            if (this.onBeat) this.onBeat();
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    _average(arr) {
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        return s / arr.length;
    }

    _smooth(prev, next, factor) {
        return prev * factor + next * (1 - factor);
    }

    // Retourne l'array FFT brut pour visualisation externe (ex: waveform)
    getFFTData() {
        if (!this.analyser) return null;
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    dispose() {
        this.stop();
        this.stopMic();
        if (this.ctx) { this.ctx.close(); this.ctx = null; }
    }
}
