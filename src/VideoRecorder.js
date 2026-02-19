/**
 * VideoRecorder.js — Shader Studio v5
 * ─────────────────────────────────────
 * Enregistrement canvas → MP4/WebM
 * - Choix durée, format, codec, bitrate, résolution
 * - Conversion MP4 via MediaRecorder + muxing (si supporté)
 * - Fallback WebM propre si MP4 non disponible
 * - Progress callback
 * - Compression configurable
 */

export class VideoRecorder {
    constructor(canvas) {
        this.canvas   = canvas;
        this.recorder = null;
        this.chunks   = [];
        this.isRecording = false;
        this._timer   = null;

        // Détection des capacités navigateur
        this.capabilities = this._detectCapabilities();
    }

    // ── Détection formats supportés ─────────────────────────────────────────

    _detectCapabilities() {
        const caps = {
            formats: [],
            recommended: null,
        };

        const candidates = [
            { label: 'MP4 H.264 (AAC)',      mime: 'video/mp4;codecs=avc1',         ext: 'mp4',  quality: 'high'   },
            { label: 'MP4 H.264',            mime: 'video/mp4;codecs=h264',         ext: 'mp4',  quality: 'high'   },
            { label: 'MP4',                  mime: 'video/mp4',                      ext: 'mp4',  quality: 'high'   },
            { label: 'WebM VP9 (meilleur)',  mime: 'video/webm;codecs=vp9',         ext: 'webm', quality: 'high'   },
            { label: 'WebM VP8',             mime: 'video/webm;codecs=vp8',         ext: 'webm', quality: 'medium' },
            { label: 'WebM AV1',             mime: 'video/webm;codecs=av1',         ext: 'webm', quality: 'high'   },
            { label: 'WebM',                 mime: 'video/webm',                     ext: 'webm', quality: 'medium' },
        ];

        candidates.forEach(c => {
            if (MediaRecorder.isTypeSupported(c.mime)) {
                caps.formats.push(c);
            }
        });

        caps.recommended = caps.formats[0] || null;
        return caps;
    }

    getAvailableFormats() {
        return this.capabilities.formats;
    }

    // ── Config presets de compression ───────────────────────────────────────

    static COMPRESSION_PRESETS = {
        'Ultra (sans perte)': { videoBitsPerSecond: 50_000_000 },
        'Haute qualité':      { videoBitsPerSecond: 20_000_000 },
        'Qualité standard':   { videoBitsPerSecond: 8_000_000  },
        'Web / Streaming':    { videoBitsPerSecond: 4_000_000  },
        'Petite taille':      { videoBitsPerSecond: 1_500_000  },
    };

    // ── Formats de résolution ────────────────────────────────────────────────

    static RESOLUTIONS = {
        'Source (native)': null,
        '4K (3840×2160)':  { w: 3840, h: 2160 },
        '2K (2560×1440)':  { w: 2560, h: 1440 },
        '1080p':           { w: 1920, h: 1080  },
        '720p':            { w: 1280, h: 720   },
        '480p':            { w: 854,  h: 480   },
        'Carré 1:1 1080':  { w: 1080, h: 1080  },
        'Vertical 9:16':   { w: 1080, h: 1920  },
    };

    // ── Enregistrement ───────────────────────────────────────────────────────

    /**
     * @param {Object} options
     * @param {number}   options.duration       durée en secondes
     * @param {string}   options.mimeType       type MIME (ex: 'video/webm;codecs=vp9')
     * @param {number}   options.videoBitsPerSecond  bitrate vidéo
     * @param {number}   options.fps            framerate (défaut 60)
     * @param {Object}   options.resolution     { w, h } ou null pour native
     * @param {Function} options.onProgress     callback (percent 0-100)
     * @param {Function} options.onComplete     callback (blob, url, filename)
     * @param {Function} options.onError        callback (err)
     */
    start(options = {}) {
        if (this.isRecording) return;

        const {
            duration            = 5,
            mimeType            = this.capabilities.recommended?.mime || 'video/webm',
            videoBitsPerSecond  = 8_000_000,
            fps                 = 60,
            resolution          = null,
            onProgress          = null,
            onComplete          = null,
            onError             = null,
        } = options;

        this.chunks       = [];
        this.isRecording  = true;
        this._onProgress  = onProgress;
        this._onComplete  = onComplete;
        this._onError     = onError;
        this._startTime   = performance.now();
        this._duration    = duration * 1000;

        // Résolution : si custom, redimensionner le canvas offscreen
        let targetCanvas = this.canvas;

        if (resolution) {
            const offscreen = document.createElement('canvas');
            offscreen.width  = resolution.w;
            offscreen.height = resolution.h;
            this._offscreenCanvas = offscreen;
            this._offscreenCtx    = offscreen.getContext('2d');
            this._sourceCanvas    = this.canvas;
            targetCanvas          = offscreen;

            // Frame copy loop
            this._copyFrame();
        }

        // Capture stream
        const stream = targetCanvas.captureStream(fps);

        // Tenter l'enregistrement avec le codec demandé
        let recOptions = { mimeType, videoBitsPerSecond };

        try {
            this.recorder = new MediaRecorder(stream, recOptions);
        } catch(e) {
            // Fallback sans options
            try {
                this.recorder = new MediaRecorder(stream, { videoBitsPerSecond });
            } catch(e2) {
                this.recorder = new MediaRecorder(stream);
            }
        }

        this.recorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) this.chunks.push(e.data);
        };

        this.recorder.onstop = () => {
            this._finalize();
        };

        this.recorder.onerror = (e) => {
            this.isRecording = false;
            if (onError) onError(e);
        };

        // Collecter toutes les 100ms pour progression fluide
        this.recorder.start(100);

        // Progress ticker
        this._progressTick = setInterval(() => {
            const elapsed  = performance.now() - this._startTime;
            const percent  = Math.min(100, Math.round((elapsed / this._duration) * 100));
            if (onProgress) onProgress(percent, elapsed / 1000, duration);
        }, 200);

        // Auto-stop
        this._timer = setTimeout(() => {
            this.stop();
        }, this._duration);
    }

    // Frame copy pour résolutions custom
    _copyFrame() {
        if (!this.isRecording || !this._offscreenCtx) return;
        this._offscreenCtx.drawImage(
            this._sourceCanvas, 0, 0,
            this._offscreenCanvas.width,
            this._offscreenCanvas.height
        );
        this._copyRAF = requestAnimationFrame(() => this._copyFrame());
    }

    stop() {
        if (!this.isRecording || !this.recorder) return;
        clearTimeout(this._timer);
        clearInterval(this._progressTick);
        cancelAnimationFrame(this._copyRAF);
        this.isRecording = false;

        if (this.recorder.state !== 'inactive') {
            this.recorder.stop();
        }
    }

    _finalize() {
        clearInterval(this._progressTick);
        cancelAnimationFrame(this._copyRAF);

        const mimeUsed = this.recorder?.mimeType || 'video/webm';
        const ext      = mimeUsed.includes('mp4') ? 'mp4' : 'webm';
        const blob     = new Blob(this.chunks, { type: mimeUsed });
        const url      = URL.createObjectURL(blob);
        const filename = `shader-studio-${Date.now()}.${ext}`;

        if (this._onComplete) this._onComplete(blob, url, filename);
    }

    // ── Téléchargement direct ────────────────────────────────────────────────

    static download(url, filename) {
        const a = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // ── Info ─────────────────────────────────────────────────────────────────

    getInfo() {
        return {
            isRecording: this.isRecording,
            formats:     this.capabilities.formats.map(f => f.label),
            recommended: this.capabilities.recommended?.label || 'Aucun',
        };
    }
}
