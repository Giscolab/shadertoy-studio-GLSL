/**
 * Shader Studio v5 — App.js (Babylon.js Version)
 * ─────────────────────────
 * Migration complète vers Babylon.js
 */

import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { vertexShaderMain, fragmentShaderMain, ShaderChunks, PRESETS, SHADERTOY_TEMPLATES } from './shaders.js';
import { params, audioParams, videoParams } from './Config.js';
import { AudioEngine } from './AudioEngine.js';
import { VideoRecorder } from './VideoRecorder.js';
import { MidiHandler } from './MidiHandler.js';
import { buildShadertoyExport } from './ShadertoyExporter.js';
import { WebGPUCompute } from './WebGPUCompute.js';

// ── Post-process custom shaders (GLSL Babylon compatible) ────────────────────

const PixelShader = {
    name: "pixel",
    fragmentUrl: `precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float uPixelSize;
    uniform vec2 uResolution;
    void main() {
        vec2 d = uPixelSize / uResolution;
        vec2 uv = d * floor(vUV / d);
        gl_FragColor = texture2D(textureSampler, uv);
    }`
};

const VignetteShader = {
    name: "vignette",
    fragmentUrl: `precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float uAmount;
    void main() {
        vec4 c = texture2D(textureSampler, vUV);
        float d = distance(vUV, vec2(0.5));
        c.rgb *= smoothstep(0.85, 0.2, d * uAmount * 1.5);
        gl_FragColor = c;
    }`
};

const GlitchShader = {
    name: "glitch",
    fragmentUrl: `precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float uTime;
    uniform float uAmount;   // 0.0 – 1.0
    uniform vec2  uResolution;

    // Hash rapide
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    float hash2(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
        vec2 uv = vUV;
        float t  = uTime;
        float amt = uAmount;

        // ── Scanlines horizontales aléatoires ──
        float sliceCount = 20.0 + amt * 40.0;
        float sliceY = floor(uv.y * sliceCount) / sliceCount;
        float sliceSeed = hash(sliceY + floor(t * 8.0));
        // Déclenche le glitch uniquement sur certaines lignes
        float trigger = step(1.0 - amt * 0.4, sliceSeed);

        // ── Offset horizontal (décalage de ligne) ──
        float offsetX = (hash(sliceY + t * 3.7) * 2.0 - 1.0) * 0.06 * amt * trigger;
        uv.x += offsetX;

        // ── Bloc glitch vertical (gros blocs qui sautent) ──
        float blockTime   = floor(t * 4.0);
        float blockSliceY = floor(uv.y * 8.0) / 8.0;
        float blockSeed   = hash(blockSliceY * 13.7 + blockTime);
        float blockTrigger = step(1.0 - amt * 0.25, blockSeed);
        float blockOffsetX = (hash(blockSeed + 1.3) * 2.0 - 1.0) * 0.15 * amt * blockTrigger;
        uv.x += blockOffsetX;

        // ── Pixel shift vertical ──
        float shiftY = (hash2(vec2(floor(t * 15.0), floor(uv.x * 60.0))) * 2.0 - 1.0)
                       * 0.004 * amt;
        uv.y += shiftY;

        // ── Clamp UV ──
        uv = clamp(uv, 0.0, 1.0);

        // ── RGB split sur les zones glitchées ──
        float rgbSplit = (0.005 + amt * 0.012) * (trigger + blockTrigger * 0.5);
        float r = texture2D(textureSampler, uv + vec2( rgbSplit, 0.0)).r;
        float g = texture2D(textureSampler, uv).g;
        float b = texture2D(textureSampler, uv + vec2(-rgbSplit, 0.0)).b;
        vec4 col = vec4(r, g, b, 1.0);

        // ── Scanlines fines (CRT) ──
        float scanline = sin(uv.y * uResolution.y * 1.5) * 0.04 * amt;
        col.rgb -= scanline;

        // ── Flash aléatoire global ──
        float flashSeed = hash(floor(t * 20.0));
        float flash = step(1.0 - amt * 0.08, flashSeed) * (hash(flashSeed) * 0.3);
        col.rgb += flash;

        // ── Bandes de couleur numériques ──
        float bandSeed = hash(floor(uv.y * 80.0) + floor(t * 6.0) * 37.0);
        float band     = step(1.0 - amt * 0.15, bandSeed);
        col.rgb = mix(col.rgb, vec3(hash2(vec2(bandSeed, t)), hash2(vec2(t, bandSeed)), hash2(vec2(bandSeed*2.0, t*0.5))), band * 0.4);

        gl_FragColor = col;
    }`
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const hexToColor3 = (v) => {
    if (typeof v === 'object' && 'r' in v) return new BABYLON.Color3(v.r/255, v.g/255, v.b/255);
    return BABYLON.Color3.FromHexString(v);
};
const fmt = s => { const m=Math.floor(s/60),sec=Math.floor(s%60); return `${m}:${sec.toString().padStart(2,'0')}`; };

// ── App ──────────────────────────────────────────────────────────────────────

export class App {
    constructor() {
        this.canvas  = document.querySelector('canvas');
        
        // Initialisation Babylon
        this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
        this.scene = null; 
        this.camera = null; 
        this.mesh = null; 
        this.material = null;
        this.currentTexture = null;
        this.currentMatcap = null;
        this.textureLibrary = [];
        this.layerTextures = { layer1: null, layer2: null };
        this.oscSocket = null;
        this.oscState = { status: 'Déconnecté', url: 'ws://localhost:8081', route: '/shader' };
        this._videoTexture = null;
        this._videoElement = null;
        this._webcamStream = null;
        
        // Pipeline Post-Process
        this.pipeline = null;
        this.pixelPass = null;
        this.vignettePass = null;

        this.editor      = null;
        this.pane        = null;
        this.debugObject = {};
        this.audioDB     = {};
        this.videoDB     = { ...videoParams };
        this.resolutionScale = 1.0;
        this.fpsGraph    = null;

        this.audio    = new AudioEngine();
        this.recorder = new VideoRecorder(this.canvas);
        this.midi     = new MidiHandler();
        this.midiState = {
            lastMsg: 'En attente...',
            targetParam: params.find(p=>p.type==='float')?.id || 'uSpeed',
        };
        this._beatFlash = 0;

        // ── ShaderToy compatibility mode ──────────────────────────────────────
        this.shadertoyMode  = false;   // true = fullscreen ShaderToy pass active
        this.shadertoyPass  = null;    // Babylon PostProcess running user ST code
        this.shadertoyCode  = '';      // raw user ShaderToy source
        this._stFrame       = 0;       // iFrame counter
        this._stStartTime   = performance.now();
        this._stLastTime    = performance.now();
        this._stTimeDelta   = 0;       // iTimeDelta
        // iMouse: xy = current pos (fragcoord px), zw = click-start pos
        this._stMouse       = { x:0, y:0, z:0, w:0 };
        this._stMouseDown   = false;
        this._stFlipY       = false;   // toggle Y-flip pour corriger l'orientation Babylon
        this.webgpuCompute = new WebGPUCompute();
        this._computeState = {
            supported: WebGPUCompute.isSupported() ? 'Oui ✅' : 'Non ❌',
            status: 'Inactif',
            particles: 4096,
            sample: '(aucun)',
        };
        // Audio FFT texture (iChannel0 when audio active)
        this._fftTexture    = null;
        this._fftCanvas     = null;
        this._fftCtx        = null;

        this._playerState = { status:'⏹ Stopped', time:'0:00 / 0:00', bpm:'-- BPM', file:'Aucun fichier' };
        this._recordState = { status:'⏹ Prêt', progress:0, info:'' };
        this._gifState = { status:'⏹ Prêt', fps:12, duration:3, width:512, height:512 };
        this._history = { undoStack: [], redoStack: [], max: 80, isRestoring: false };
        this._dragDepth = 0;

        this.mouse       = new BABYLON.Vector2(0.5,0.5);
        this.targetMouse = new BABYLON.Vector2(0.5,0.5);

        this.resizeHandler     = this.onResize.bind(this);
        this.fullscreenHandler = this.toggleFullscreen.bind(this);
        this.mouseHandler      = this.onMouseMove.bind(this);
        this.closeModalHandler = ()=>{ document.getElementById('code-modal').style.display='none'; };
        this.toggleUIHandler   = this.toggleUI.bind(this);
        this.toggleEditorHandler = this.toggleEditor.bind(this);
        this.dropHandler       = this.onDrop.bind(this);
        this.dragEnterHandler  = this.onDragEnter.bind(this);
        this.dragLeaveHandler  = this.onDragLeave.bind(this);
        this.dragOverHandler   = this.onDragOver.bind(this);
        this.keydownHandler    = this.onKeyDown.bind(this);

        this.setupErrorHandler();
        this.init();
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    init() {
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.02, 1);

        params.forEach(p=>{ this.debugObject[p.id]=p.value; });
        audioParams.forEach(p=>{ this.audioDB[p.id]=p.value; });

        // Initialisation des propriétés manquantes pour le mapping audio
        this.debugObject.uBassDisplace = 0.5;
        this.debugObject.uMidDisplace  = 0.5;
        this.debugObject.uHighDisplace = 0.5;

        try {
            const saved=localStorage.getItem('shaderStudioV5');
            if(saved){ const d=JSON.parse(saved); Object.assign(this.debugObject,d.shader||{}); Object.assign(this.audioDB,d.audio||{}); }
            const savedMidi=localStorage.getItem('shaderStudioV5_midi');
            if(savedMidi) this.midi.mappings = JSON.parse(savedMidi);
        } catch(e){}

        this._loadConfigFromHash();

        // Caméra (ArcRotate remplace OrbitControls)
        this.camera = new BABYLON.ArcRotateCamera("Camera", -Math.PI/2, Math.PI/2, 2.5, BABYLON.Vector3.Zero(), this.scene);
        this.camera.attachControl(this.canvas, true);
        this.camera.wheelPrecision = 50;

        // Textures par défaut
        const defTex = this._makeGridTexture();
        const mcTex = this._makeMatcapTexture();
        this.currentTexture = defTex;
        this.currentMatcap = mcTex;

        // Création du ShaderMaterial
        const nt = this.debugObject.noiseType || 'simplex';
        this._createShaderMaterial(nt, defTex, mcTex);

        // Mesh initial
        this.updateGeometry(this.debugObject.geometryType);

        // Post-Processing
        this._initPostProcessing();
        this._initVideoRecorderDefaults();
        this._loadTextureLibrary();
        this._initPane();
        this._initAudioCallbacks();

        // Events
        window.addEventListener('resize', this.resizeHandler);
        this.canvas.addEventListener('dblclick', this.fullscreenHandler);
        this.canvas.addEventListener('mousemove', this.mouseHandler);
        document.getElementById('close-modal').addEventListener('click', this.closeModalHandler);
        document.getElementById('ui-toggle').addEventListener('click', this.toggleUIHandler);
        document.getElementById('editor-toggle').addEventListener('click', this.toggleEditorHandler);
        this.canvas.addEventListener('dragenter', this.dragEnterHandler);
        this.canvas.addEventListener('dragleave', this.dragLeaveHandler);
        this.canvas.addEventListener('dragover', this.dragOverHandler);
        this.canvas.addEventListener('drop', this.dropHandler);
        window.addEventListener('keydown', this.keydownHandler);

        // ShaderToy iMouse tracking
        this.canvas.addEventListener('mousemove', e => {
            if (this.shadertoyMode) {
                const r = this.canvas.getBoundingClientRect();
                this._stMouse.x = e.clientX - r.left;
                this._stMouse.y = this.canvas.height - (e.clientY - r.top); // flip Y
                if (this._stMouseDown) {
                    this._stMouse.z = this._stMouse.x;
                    this._stMouse.w = this._stMouse.y;
                }
            }
        });
        this.canvas.addEventListener('mousedown', e => {
            if (this.shadertoyMode) {
                this._stMouseDown = true;
                const r = this.canvas.getBoundingClientRect();
                this._stMouse.z = e.clientX - r.left;
                this._stMouse.w = this.canvas.height - (e.clientY - r.top);
            }
        });
        this.canvas.addEventListener('mouseup', () => { this._stMouseDown = false; });
        const ab=document.getElementById('start-audio-btn'); if(ab) ab.style.display='none';

        this.hideLoader();
        this.initEditor();

        // Boucle de rendu
        this.engine.runRenderLoop(() => {
            this.animate();
            this.scene.render();
        });

        this._recordHistory('init');
    }

    _serializeState() {
        const shader = {};
        params.forEach(p => { shader[p.id] = this.debugObject[p.id]; });
        return {
            shader,
            audio: { ...this.audioDB },
            midi:  { ...this.midi.mappings },
        };
    }

    _applySerializedState(state) {
        if (!state) return;

        if (state.shader) {
            Object.entries(state.shader).forEach(([k, v]) => {
                if (k in this.debugObject) this.debugObject[k] = v;
            });
        }
        if (state.audio) {
            Object.entries(state.audio).forEach(([k, v]) => {
                if (k in this.audioDB) this.audioDB[k] = v;
            });
        }
        if (state.midi) {
            this.midi.mappings = { ...state.midi };
            localStorage.setItem('shaderStudioV5_midi', JSON.stringify(this.midi.mappings));
        }

        params.forEach(p => this._applyChange(p, this.debugObject[p.id]));
        this._updateMaterialUniforms();
        this.pane?.refresh();
    }

    _encodeStateToHash(state) {
        const json = JSON.stringify(state);
        return btoa(unescape(encodeURIComponent(json)));
    }

    _decodeStateFromHash(hashValue) {
        try {
            const raw = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue;
            if (!raw) return null;
            const json = decodeURIComponent(escape(atob(raw)));
            return JSON.parse(json);
        } catch (e) {
            console.warn('Hash config invalide:', e);
            return null;
        }
    }

    _loadConfigFromHash() {
        const cfg = this._decodeStateFromHash(window.location.hash);
        if (!cfg) return;
        if (cfg.shader) Object.assign(this.debugObject, cfg.shader);
        if (cfg.audio) Object.assign(this.audioDB, cfg.audio);
        if (cfg.midi) this.midi.mappings = { ...cfg.midi };
    }

    _copyShareUrl() {
        const state = this._serializeState();
        const hash  = this._encodeStateToHash(state);
        const url   = `${window.location.origin}${window.location.pathname}#${hash}`;
        navigator.clipboard.writeText(url).then(() => this._showSuccess('🔗 URL de partage copiée !'));
    }

    _recordHistory() {
        if (this._history.isRestoring) return;
        const snapshot = JSON.stringify(this._serializeState());
        const stack = this._history.undoStack;
        if (stack[stack.length - 1] === snapshot) return;
        stack.push(snapshot);
        if (stack.length > this._history.max) stack.shift();
        this._history.redoStack.length = 0;
    }

    _restoreFromHistory(targetStack, oppositeStack) {
        if (targetStack === this._history.undoStack && targetStack.length < 2) return;
        if (targetStack === this._history.redoStack && targetStack.length < 1) return;
        const current = JSON.stringify(this._serializeState());
        oppositeStack.push(current);
        let snapshot;
        if (targetStack === this._history.undoStack) {
            targetStack.pop();
            snapshot = targetStack[targetStack.length - 1];
        } else {
            snapshot = targetStack.pop();
        }
        this._history.isRestoring = true;
        this._applySerializedState(JSON.parse(snapshot));
        this._history.isRestoring = false;
    }

    undo() { this._restoreFromHistory(this._history.undoStack, this._history.redoStack); }
    redo() { this._restoreFromHistory(this._history.redoStack, this._history.undoStack); }

    _createShaderMaterial(noiseType, texture, matcap, customFragment = null) {
        if (this.material) this.material.dispose();

        // Mise à jour des références
        this.currentTexture = texture;
        this.currentMatcap = matcap;

        // Concaténation des sources shaders
        // Injection de la précision en tête pour couvrir les Chunks
        const vertexSource = "precision highp float;\n" + ShaderChunks[noiseType] + vertexShaderMain;
        const fragmentSource = "precision highp float;\n" + ShaderChunks[noiseType] + (customFragment || fragmentShaderMain);

        this.material = new BABYLON.ShaderMaterial("shader", this.scene, {
            vertexSource: vertexSource,
            fragmentSource: fragmentSource,
        }, {
            attributes: ["position", "normal", "uv"],
            uniforms: [
                "world", "worldView", "worldViewProjection", "view", "projection",
                "uTime", "uResolution", "uMouse",
                "uColorA", "uColorB", "uColorC", "uColorD", "uRimColor",
                "uScale", "uSpeed", "uTwist", "uPulse", "uMorphFactor", "uDisplacementStrength",
                "uMetalness", "uLightIntensity", "uRimPower", "uFresnelStrength", "uGlowRadius",
                "uContrast", "uSaturation", "uGamma", "uTextureMix",
                "uLayerBlend1", "uLayerBlend2", "uLayerOpacity1", "uLayerOpacity2",
                "uBass", "uMid", "uHigh", "uOverall",
                "uBassDisplace", "uMidDisplace", "uHighDisplace"
            ],
            samplers: ["uTexture", "uMatcap", "uLayer1", "uLayer2"]
        });

        this.material.backFaceCulling = false; // DoubleSide
        this.material.setTexture("uTexture", texture);
        this.material.setTexture("uMatcap", matcap);
        this.material.setTexture("uLayer1", texture);
        this.material.setTexture("uLayer2", matcap);
        this.material.setVector2("uResolution", new BABYLON.Vector2(this.canvas.width, this.canvas.height));

        // Gestion d'erreur de compilation
        this.material.onError = (effect, errors) => {
            const toast = document.getElementById('error-toast');
            if(toast){ toast.textContent='❌ Erreur Shader: ' + errors; toast.classList.add('visible'); setTimeout(()=>toast.classList.remove('visible'), 5000); }
            console.error("Shader Error", errors);
        };
        
        // Initialisation des valeurs
        this._updateMaterialUniforms();
        if(this.mesh) this.mesh.material = this.material;
    }

    _makeGridTexture(){
        const tex = new BABYLON.DynamicTexture("grid", {width:512, height:512}, this.scene);
        const ctx = tex.getContext();
        ctx.fillStyle='#111'; ctx.fillRect(0,0,512,512);
        ctx.strokeStyle='#2a2a2a'; ctx.lineWidth=1;
        for(let i=0;i<512;i+=32){
            ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,512);ctx.stroke();
            ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(512,i);ctx.stroke();
        }
        tex.update();
        return tex;
    }

    _makeMatcapTexture(){
        const tex = new BABYLON.DynamicTexture("matcap", {width:256, height:256}, this.scene);
        const ctx = tex.getContext();
        const g=ctx.createRadialGradient(80,80,0,128,128,180);
        g.addColorStop(0,'#fff');g.addColorStop(.15,'#d0d0d0');g.addColorStop(.4,'#808080');g.addColorStop(.8,'#303030');g.addColorStop(1,'#050505');
        ctx.fillStyle=g;ctx.fillRect(0,0,256,256);
        tex.update();
        return tex;
    }

    // ── Editor Logic ──────────────────────────────────────────────────────────

    initEditor() {
        const area = document.getElementById('glsl-editor');
        if(!area) return;

        if (typeof CodeMirror === 'undefined') {
            console.warn('CodeMirror not loaded. Editor disabled.');
            return;
        }

        this.editor = CodeMirror.fromTextArea(area, {
            mode: "text/x-c++src",
            theme: "dracula",
            lineNumbers: true,
            matchBrackets: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            lineWrapping: true
        });

        const saved = localStorage.getItem('custom-shader');
        this.editor.setValue(saved || fragmentShaderMain);

        // Auto-detect ShaderToy on content change
        this.editor.on('change', () => {
            const code = this.editor.getValue();
            const isST = App.detectShaderToy(code);
            const badge = document.getElementById('st-badge');
            if (badge) badge.style.display = isST ? 'inline-block' : 'none';
        });

        document.getElementById('btn-compile')?.addEventListener('click', () => this.compileShader());

        document.getElementById('btn-save')?.addEventListener('click', () => {
            const code = this.editor.getValue();
            // Sauvegarde localStorage (backup)
            localStorage.setItem('custom-shader', code);
            // Téléchargement .glsl sur le disque
            const blob = new Blob([code], { type: 'text/plain' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `shader-${Date.now()}.glsl`;
            a.click();
            URL.revokeObjectURL(url);
            this._showSuccess('💾 Shader exporté en .glsl !');
        });

        document.getElementById('btn-export-shadertoy')?.addEventListener('click', () => {
            const code = buildShadertoyExport(this.debugObject);
            const blob = new Blob([code], { type: 'text/plain' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `shadertoy-export-${Date.now()}.glsl`;
            a.click();
            URL.revokeObjectURL(url);
            if (this.editor) this.editor.setValue(code);
            this._showSuccess('🚀 Export Shadertoy généré (.glsl)');
        });

        document.getElementById('btn-clear')?.addEventListener('click', () => {
            if (confirm('Vider l\'éditeur ?')) {
                this.editor.setValue('');
                this.editor.focus();
            }
        });

        // ── Bouton ShaderToy Mode ──
        const stBtn = document.getElementById('btn-shadertoy');
        if (stBtn) {
            stBtn.addEventListener('click', () => {
                if (this.shadertoyMode) {
                    this.disableShaderToy();
                    stBtn.textContent = '🎮 ShaderToy Mode';
                    stBtn.classList.remove('active');
                } else {
                    const code = this.editor.getValue();
                    this.enableShaderToy(code);
                    stBtn.textContent = '🔲 Mode 3D';
                    stBtn.classList.add('active');
                }
            });
        }

        // ── Bouton Import .glsl depuis le disque ──
        const importBtn = document.getElementById('btn-st-import');
        if (importBtn) {
            importBtn.textContent = '📂 Import';
            const glslInput = document.createElement('input');
            glslInput.type   = 'file';
            glslInput.accept = '.glsl,.frag,.vert,.txt';
            glslInput.style.display = 'none';
            document.body.appendChild(glslInput);

            importBtn.addEventListener('click', () => glslInput.click());

            glslInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const code = ev.target.result;
                    this.editor.setValue(code);
                    this._showSuccess(`📂 "${file.name}" chargé !`);
                    // Reset input pour permettre de recharger le même fichier
                    glslInput.value = '';
                };
                reader.readAsText(file);
            });
        }

        // Ctrl+S
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.compileShader();
            }
        });
    }

    compileShader() {
        if (!this.editor) return;
        const code = this.editor.getValue();

        // Auto-dispatch selon le type de code détecté
        if (App.detectShaderToy(code)) {
            // Mode ShaderToy
            if (!this.shadertoyMode) {
                this.shadertoyMode = true;
                this._stFrame     = 0;
                this._stStartTime = performance.now();
                this._stLastTime  = performance.now();
                if (this.mesh) this.mesh.isVisible = false;
                if (this.pipeline) this.pipeline.bloomEnabled = false;
                const stBtn = document.getElementById('btn-shadertoy');
                if (stBtn) { stBtn.textContent = '🔲 Mode 3D'; stBtn.classList.add('active'); }
            }
            this.compileShadertoy(code);
            this._showSuccess('✅ ShaderToy compilé');
        } else {
            // Mode 3D standard
            if (this.shadertoyMode) {
                this.disableShaderToy();
                const stBtn = document.getElementById('btn-shadertoy');
                if (stBtn) { stBtn.textContent = '🎮 ShaderToy Mode'; stBtn.classList.remove('active'); }
            }
            const nt  = this.debugObject.noiseType || 'simplex';
            const tex = this.currentTexture || this._makeGridTexture();
            const mat = this.currentMatcap  || this._makeMatcapTexture();
            this._createShaderMaterial(nt, tex, mat, code);
            this._showSuccess('✅ Shader 3D compilé');
        }
    }

    // ── Post-Processing ───────────────────────────────────────────────────────

    _initPostProcessing(){
        const d = this.debugObject;
        
        // Pipeline standard (Bloom, ImageProcessing, ChromaticAberration)
        this.pipeline = new BABYLON.DefaultRenderingPipeline("defaultPipeline", true, this.scene, [this.camera]);
        
        // Bloom
        this.pipeline.bloomEnabled    = true;
        this.pipeline.bloomKernel     = this._bloomKernelFromRadius(d.bloomRadius ?? 0.4);
        this.pipeline.bloomScale      = this._bloomScaleFromRadius(d.bloomRadius ?? 0.4);
        this.pipeline.bloomWeight     = d.bloomStrength * 0.5;
        this.pipeline.bloomThreshold  = d.bloomThreshold;

        // Chromatic Aberration (Cyberpunk / RGB Shift)
        this.pipeline.chromaticAberrationEnabled = !!d.cyberpunkMode;
        this.pipeline.chromaticAberration.aberrationAmount = 0;

        // Custom Shaders
        // Pixel Art
        BABYLON.Effect.ShadersStore["pixelFragmentShader"] = PixelShader.fragmentUrl;
        this.pixelPass = new BABYLON.PostProcess("pixel", "pixel", ["uPixelSize", "uResolution"], null, 1.0, this.camera);
        this.pixelPass.onApply = (effect) => {
            effect.setFloat("uPixelSize", d.pixelSize);
            effect.setVector2("uResolution", new BABYLON.Vector2(this.canvas.width, this.canvas.height));
        };
        if (!d.pixelMode) this.camera.detachPostProcess(this.pixelPass);

        // Vignette
        BABYLON.Effect.ShadersStore["vignetteFragmentShader"] = VignetteShader.fragmentUrl;
        this.vignettePass = new BABYLON.PostProcess("vignette", "vignette", ["uAmount"], null, 1.0, this.camera);
        this.vignettePass.onApply = (effect) => {
            effect.setFloat("uAmount", d.vignetteAmount);
        };
        if (!d.vignetteMode) this.camera.detachPostProcess(this.vignettePass);

        // Glitch
        BABYLON.Effect.ShadersStore["glitchFragmentShader"] = GlitchShader.fragmentUrl;
        this.glitchPass = new BABYLON.PostProcess("glitch", "glitch", ["uTime","uAmount","uResolution"], null, 1.0, this.camera);
        this.glitchPass.onApply = (effect) => {
            effect.setFloat  ("uTime",       performance.now() / 1000);
            effect.setFloat  ("uAmount",     this.debugObject.glitchAmount);
            effect.setVector2("uResolution", new BABYLON.Vector2(this.canvas.width, this.canvas.height));
        };
        if (!d.glitchMode) this.camera.detachPostProcess(this.glitchPass);
    }

    // ── VideoRecorder defaults ────────────────────────────────────────────────

    _initVideoRecorderDefaults(){
        const fmts=this.recorder.getAvailableFormats();
        if(fmts.length>0){ this.videoDB.format=fmts[0].mime; this.videoDB._formatLabel=fmts[0].label; }
    }

    // ── Audio callbacks ───────────────────────────────────────────────────────

    _initAudioCallbacks(){
        this.audio.onBeat=()=>{ if(this.audioDB.beatFlash) this._beatFlash=4; };
        this.audio.onBPMUpdate=bpm=>{ this._playerState.bpm=`${bpm} BPM`; if(this._bpmB) this._bpmB.refresh(); };
        this.audio.onEnded=()=>{ this._playerState.status='⏹ Terminé'; if(this._statusB) this._statusB.refresh(); };
        this.audio.onTimeUpdate=(cur,dur)=>{ this._playerState.time=`${fmt(cur)} / ${fmt(dur)}`; if(this._timeB) this._timeB.refresh(); };
    }

    _saveTextureLibrary() {
        try {
            localStorage.setItem('shaderStudioV5_textures', JSON.stringify(this.textureLibrary));
        } catch (e) {
            console.warn('Texture library save failed', e);
        }
    }

    _loadTextureLibrary() {
        try {
            const raw = localStorage.getItem('shaderStudioV5_textures');
            this.textureLibrary = raw ? JSON.parse(raw) : [];
        } catch (e) {
            this.textureLibrary = [];
        }
    }

    _addTextureToLibrary(name, dataUrl) {
        this.textureLibrary.unshift({ id: `tex-${Date.now()}`, name, dataUrl });
        this.textureLibrary = this.textureLibrary.slice(0, 24);
        this._saveTextureLibrary();
    }

    _setLayerTexture(layerId, source) {
        const tex = new BABYLON.Texture(source, this.scene);
        this.layerTextures[layerId] = tex;
        if (this.material) this.material.setTexture(layerId === 'layer1' ? 'uLayer1' : 'uLayer2', tex);
    }

    async _setVideoTextureFromFile(file) {
        this._stopVideoTexture();
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = url;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        this._videoElement = video;
        this._videoTexture = new BABYLON.VideoTexture('videoTexture', video, this.scene, true, false);
        this.material.setTexture('uTexture', this._videoTexture);
        this.currentTexture = this._videoTexture;
        this._showSuccess(`🎬 Vidéo en texture: ${file.name}`);
    }

    async _setWebcamTexture() {
        this._stopVideoTexture();
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        this._webcamStream = stream;
        this._videoElement = video;
        this._videoTexture = new BABYLON.VideoTexture('webcamTexture', video, this.scene, true, false);
        this.material.setTexture('uTexture', this._videoTexture);
        this.currentTexture = this._videoTexture;
        this._showSuccess('📷 Webcam activée en uTexture');
    }

    _stopVideoTexture() {
        if (this._videoTexture) { this._videoTexture.dispose(); this._videoTexture = null; }
        if (this._videoElement?.src) URL.revokeObjectURL(this._videoElement.src);
        if (this._webcamStream) {
            this._webcamStream.getTracks().forEach(t => t.stop());
            this._webcamStream = null;
        }
        this._videoElement = null;
    }

    // ── Tweakpane ─────────────────────────────────────────────────────────────

    _initPane(){
        this.pane=new Pane({ container:document.getElementById('ui-container'), title:'🎛 Dashboard' });
        this.pane.registerPlugin(EssentialsPlugin);

        const tabs=this.pane.addTab({ pages:[
            {title:'🎨 Shader'},{title:'🎵 Audio'},{title:'✨ Post FX'},
            {title:'🎬 Export'},{title:'⚙️ Scène'},{title:' MIDI'},{title:'🎮 ShaderToy'},{title:'🧪 Compute'},{title:'📊 Perf'},
        ]});
        const [tShader,tAudio,tPost,tExport,tScene,tMidi,tST,tCompute,tPerf]=tabs.pages;

        // ════════ SHADER ════════
        const fPre=tShader.addFolder({title:'⭐ Presets',expanded:true});
        const preObj={preset:Object.keys(PRESETS)[0]};
        fPre.addBinding(preObj,'preset',{label:'Preset',options:Object.fromEntries(Object.keys(PRESETS).map(k=>[k,k]))})
            .on('change',ev=>this.applyPreset(ev.value));
        fPre.addButton({title:'▶ Appliquer'}).on('click',()=>this.applyPreset(preObj.preset));

        const fGeo=tShader.addFolder({title:'🔷 Géométrie & Shader',expanded:true});
        this._bind(fGeo,'geometryType'); this._bind(fGeo,'noiseType');

        const fCol=tShader.addFolder({title:'🎨 Couleurs',expanded:true});
        ['uColorA','uColorB','uColorC','uColorD','uRimColor','bgColor'].forEach(id=>this._bind(fCol,id));

        const fAni=tShader.addFolder({title:'🌀 Animation',expanded:false});
        ['uScale','uSpeed','uTwist','uPulse','uMorphFactor','uDisplacementStrength','autoRotate','rotationSpeed'].forEach(id=>this._bind(fAni,id));

        const fMat=tShader.addFolder({title:'💎 Matière',expanded:false});
        ['uMetalness','uLightIntensity','uRimPower','uFresnelStrength','uGlowRadius'].forEach(id=>this._bind(fMat,id));

        const fImg=tShader.addFolder({title:'🖼 Image / Vidéo / Layers',expanded:false});
        ['uContrast','uSaturation','uGamma','uTextureMix','uLayerOpacity1','uLayerOpacity2'].forEach(id=>this._bind(fImg,id));

        const blendModes = { Add:0, Multiply:1, Overlay:2 };
        fImg.addBinding(this.debugObject, 'uLayerBlend1', { label:'Layer1 Blend', options: blendModes })
            .on('change', ev => this.material.setFloat('uLayerBlend1', ev.value));
        fImg.addBinding(this.debugObject, 'uLayerBlend2', { label:'Layer2 Blend', options: blendModes })
            .on('change', ev => this.material.setFloat('uLayerBlend2', ev.value));
        
        const fi=document.createElement('input'); fi.type='file'; fi.accept='image/*'; fi.style.display='none';
        document.body.appendChild(fi);
        fi.addEventListener('change',e=>{ 
            const f=e.target.files[0]; if(!f) return;
            const reader = new FileReader();
            reader.onload = () => this._addTextureToLibrary(f.name, reader.result);
            reader.readAsDataURL(f);
            const url = URL.createObjectURL(f);
            const tex = new BABYLON.Texture(url, this.scene);
            this.material.setTexture("uTexture", tex);
            this.currentTexture = tex;
        });

        const fv=document.createElement('input'); fv.type='file'; fv.accept='video/*'; fv.style.display='none';
        document.body.appendChild(fv);
        fv.addEventListener('change', async e => {
            const f=e.target.files[0]; if(!f) return;
            await this._setVideoTextureFromFile(f);
        });

        const fl1=document.createElement('input'); fl1.type='file'; fl1.accept='image/*'; fl1.style.display='none';
        const fl2=document.createElement('input'); fl2.type='file'; fl2.accept='image/*'; fl2.style.display='none';
        document.body.appendChild(fl1); document.body.appendChild(fl2);
        fl1.addEventListener('change',e=>{ const f=e.target.files[0]; if(!f) return; this._setLayerTexture('layer1', URL.createObjectURL(f)); this._showSuccess(`🧱 Layer1: ${f.name}`); });
        fl2.addEventListener('change',e=>{ const f=e.target.files[0]; if(!f) return; this._setLayerTexture('layer2', URL.createObjectURL(f)); this._showSuccess(`🧱 Layer2: ${f.name}`); });

        const texOptions = () => Object.fromEntries(this.textureLibrary.map(t => [t.name, t.id]));
        const libraryPick = { textureId: this.textureLibrary[0]?.id || '' };
        const libraryBinding = fImg.addBinding(libraryPick, 'textureId', { label:'Bibliothèque', options: texOptions() });
        libraryBinding.on('change', ev => {
            const tex = this.textureLibrary.find(t => t.id === ev.value);
            if (!tex) return;
            this.material.setTexture('uTexture', new BABYLON.Texture(tex.dataUrl, this.scene));
            this._showSuccess(`📚 Texture appliquée: ${tex.name}`);
        });

        fImg.addButton({title:'📁 Upload Texture'}).on('click',()=>fi.click());
        fImg.addButton({title:'🎬 Charger vidéo'}).on('click',()=>fv.click());
        fImg.addButton({title:'📷 Webcam → uTexture'}).on('click',()=>this._setWebcamTexture().catch(err=>this._showError(`Webcam indisponible: ${err.message}`)));
        fImg.addButton({title:'🧱 Layer1 image'}).on('click',()=>fl1.click());
        fImg.addButton({title:'🧱 Layer2 image'}).on('click',()=>fl2.click());

        // ════════ AUDIO ════════
        const fPl=tAudio.addFolder({title:'▶ Lecteur',expanded:true});
        this._statusB=fPl.addBinding(this._playerState,'status',{label:'État',readonly:true});
        this._timeB  =fPl.addBinding(this._playerState,'time',  {label:'Temps',readonly:true});
        this._bpmB   =fPl.addBinding(this._playerState,'bpm',   {label:'BPM',  readonly:true});
        fPl.addBinding(this._playerState,'file',{label:'Fichier',readonly:true});

        const af=document.createElement('input'); af.type='file'; af.accept='audio/mp3,audio/wav,audio/ogg,audio/*'; af.style.display='none';
        document.body.appendChild(af);
        af.addEventListener('change',async e=>{
            const f=e.target.files[0]; if(!f) return;
            this._playerState.file=f.name.length>28?f.name.slice(0,26)+'…':f.name;
            this._playerState.status='⏳ Chargement…'; this.pane.refresh();
            await this.audio.loadFile(f);
            this.audio.play();
            this._playerState.status='▶ Lecture'; this.pane.refresh();
        });

        fPl.addButton({title:'📂 Ouvrir MP3 / WAV / OGG'}).on('click',()=>af.click());
        fPl.addButton({title:'▶ Play'}) .on('click',()=>{ this.audio.play();  this._playerState.status='▶ Lecture'; this.pane.refresh(); });
        fPl.addButton({title:'⏸ Pause'}).on('click',()=>{ this.audio.pause(); this._playerState.status='⏸ Pause';   this.pane.refresh(); });
        fPl.addButton({title:'⏹ Stop'}) .on('click',()=>{ this.audio.stop();  this._playerState.status='⏹ Stopped'; this._playerState.time='0:00 / 0:00'; this.pane.refresh(); });
        const volO={volume:1.0}; fPl.addBinding(volO,'volume',{label:'Volume',min:0,max:1.5,step:.01}).on('change',ev=>this.audio.setVolume(ev.value));

        const fMic=tAudio.addFolder({title:'🎤 Microphone',expanded:false});
        fMic.addButton({title:'🎤 Activer Micro'}).on('click',async()=>{ await this.audio.startMic(); this._playerState.status='🎤 Micro actif'; this.pane.refresh(); });
        fMic.addButton({title:'🔇 Couper Micro'}) .on('click',()=>{ this.audio.stopMic(); this._playerState.status='⏹ Stopped'; this.pane.refresh(); });

        const fVisu=tAudio.addFolder({title:'📊 Niveaux temps réel',expanded:true});
        this.debugObject._bass=0; this.debugObject._mid=0; this.debugObject._high=0; this.debugObject._overall=0;
        fVisu.addBinding(this.debugObject,'_bass',   {label:'Bass',   readonly:true,view:'graph',min:0,max:1});
        fVisu.addBinding(this.debugObject,'_mid',    {label:'Mid',    readonly:true,view:'graph',min:0,max:1});
        fVisu.addBinding(this.debugObject,'_high',   {label:'High',   readonly:true,view:'graph',min:0,max:1});
        fVisu.addBinding(this.debugObject,'_overall',{label:'Overall',readonly:true,view:'graph',min:0,max:1});

        const fGains=tAudio.addFolder({title:'🎚 Gains par bande',expanded:true});
        this._bindA(fGains,'gainBass',ev=>{this.audio.gains.bass=ev.value;});
        this._bindA(fGains,'gainMid', ev=>{this.audio.gains.mid=ev.value;});
        this._bindA(fGains,'gainHigh',ev=>{this.audio.gains.high=ev.value;});

        const fSmo=tAudio.addFolder({title:'〰 Lissage',expanded:false});
        this._bindA(fSmo,'smoothBass',ev=>{this.audio.smoothing.bass=ev.value;});
        this._bindA(fSmo,'smoothMid', ev=>{this.audio.smoothing.mid=ev.value;});
        this._bindA(fSmo,'smoothHigh',ev=>{this.audio.smoothing.high=ev.value;});

        const fMap=tAudio.addFolder({title:'🔀 Mapping Audio → Shader',expanded:true});
        const fMBass=fMap.addFolder({title:'🔴 Bass',expanded:true});
        this._bindA(fMBass,'mapBassTo');
        fMBass.addBinding(this.debugObject,'uBassDisplace',{label:'Force',min:0,max:5,step:.05}).on('change', ev=>this.material.setFloat('uBassDisplace', ev.value));
        const fMMid=fMap.addFolder({title:'🟡 Mid',expanded:true});
        this._bindA(fMMid,'mapMidTo');
        fMMid.addBinding(this.debugObject,'uMidDisplace',{label:'Force',min:0,max:5,step:.05}).on('change', ev=>this.material.setFloat('uMidDisplace', ev.value));
        const fMHigh=fMap.addFolder({title:'🔵 High',expanded:true});
        this._bindA(fMHigh,'mapHighTo');
        fMHigh.addBinding(this.debugObject,'uHighDisplace',{label:'Force',min:0,max:5,step:.05}).on('change', ev=>this.material.setFloat('uHighDisplace', ev.value));

        const fBeat=tAudio.addFolder({title:'💥 Beat',expanded:false});
        this._bindA(fBeat,'beatFlash');
        this._bindA(fBeat,'beatThreshold',ev=>{this.audio.beatThreshold=ev.value;});
        this._bindA(fBeat,'sensitivity',  ev=>{this.audio.sensitivity=ev.value;});

        // ════════ POST FX ════════
        const fBl=tPost.addFolder({title:'🌸 Bloom',expanded:true});
        this._bind(fBl,'bloomStrength', ev=>{ this.pipeline.bloomWeight = ev.value * 0.5; });
        this._bind(fBl,'bloomRadius',   ev=>{
            this.pipeline.bloomKernel = this._bloomKernelFromRadius(ev.value);
            this.pipeline.bloomScale  = this._bloomScaleFromRadius(ev.value);
        });
        this._bind(fBl,'bloomThreshold', ev=>{ this.pipeline.bloomThreshold = ev.value; });

        const fRgb=tPost.addFolder({title:'🌈 RGB Shift',expanded:false});
        this._bind(fRgb,'cyberpunkMode',ev=>{this.pipeline.chromaticAberrationEnabled=ev.value;});

        const fGl=tPost.addFolder({title:'⚡ Glitch',expanded:false});
        this._bind(fGl,'glitchMode', ev=>{
            if(ev.value) this.camera.attachPostProcess(this.glitchPass);
            else         this.camera.detachPostProcess(this.glitchPass);
        });
        this._bind(fGl,'glitchAmount', ev=>{/* handled in onApply */});

        const fPx=tPost.addFolder({title:'🕹 Pixel',expanded:false});
        this._bind(fPx,'pixelMode',ev=>{
            if(ev.value) this.camera.attachPostProcess(this.pixelPass);
            else this.camera.detachPostProcess(this.pixelPass);
        });
        this._bind(fPx,'pixelSize',ev=>{/* handled in onApply */});

        const fVg=tPost.addFolder({title:'🔲 Vignette',expanded:false});
        this._bind(fVg,'vignetteMode',  ev=>{
            if(ev.value) this.camera.attachPostProcess(this.vignettePass);
            else this.camera.detachPostProcess(this.vignettePass);
        });
        this._bind(fVg,'vignetteAmount',ev=>{/* handled in onApply */});

        // ════════ EXPORT VIDÉO ════════
        this._buildExportTab(tExport);

        // ════════ SCÈNE ════════
        const fSc=tScene.addFolder({title:'🖥 Rendu',expanded:true});
        this._bind(fSc,'wireframe',ev=>{this.material.wireframe=ev.value;});
        fSc.addBinding(this,'resolutionScale',{min:.25,max:1,step:.05,label:'Résolution'}).on('change',()=>this.onResize());

        tScene.addBlade({view:'separator'});
        const fExp=tScene.addFolder({title:'💾 Screenshot & Config',expanded:true});
        fExp.addButton({title:'📸 Screenshot (2×)'}).on('click',()=>this.saveScreenshot());
        fExp.addButton({title:'🪟 Screenshot Transparent'}).on('click',()=>this.saveScreenshot(true));
        fExp.addButton({title:'📋 Copier Config'})  .on('click',()=>this._copyConfig());
        fExp.addButton({title:'🔗 Copier URL partage'}).on('click',()=>this._copyShareUrl());
        fExp.addButton({title:'🖊 GLSL Code'})       .on('click',()=>this.generateCode());
        fExp.addButton({title:'🥽 Entrer VR/WebXR'}).on('click',()=>this._enterXR());
        tScene.addBlade({view:'separator'});
        tScene.addButton({title:'🔄 Reset Factory'}).on('click',()=>{ if(confirm('Réinitialiser ?')){ localStorage.removeItem('shaderStudioV5'); location.reload(); } });

        // ════════ MIDI ════════
        const fMidiStatus = tMidi.addFolder({title:'📡 Moniteur', expanded:true});
        this._midiMonitor = fMidiStatus.addBinding(this.midiState, 'lastMsg', {label:'Dernier CC', readonly:true});
        
        const fMidiMap = tMidi.addFolder({title:'🔗 Mapping', expanded:true});
        const mappableParams = [
            ...params.filter(p => p.type === 'float' || p.type === 'boolean'),
            ...audioParams.filter(p => p.type === 'float' || p.type === 'boolean')
        ];
        const mapOptions = Object.fromEntries(mappableParams.map(p => [p.name || p.id, p.id]));
        fMidiMap.addBinding(this.midiState, 'targetParam', { label: 'Cible', options: mapOptions });
        fMidiMap.addButton({title:'Lier Dernier CC'}).on('click', () => this._mapMidiCC());
        fMidiMap.addButton({title:'Effacer Tout'}).on('click', () => {
            if(confirm('Effacer tous les mappings MIDI ?')) {
                this.midi.mappings = {};
                localStorage.removeItem('shaderStudioV5_midi');
            }
        });

        // MIDI
        const midiFolder = tMidi.addFolder({ title: '🎛️ MIDI', expanded: true });
        let midiButton;
        midiButton = midiFolder.addButton({ title: '🔌 Connecter MIDI' }).on('click', async () => {
            const success = await this._connectMidi();
            if (success) {
                midiButton.title = '✅ MIDI Connecté';
                midiButton.disabled = true;
                const toast = document.getElementById('error-toast');
                if (toast) {
                    toast.textContent = '✅ MIDI connecté !';
                    toast.classList.add('visible');
                    setTimeout(() => toast.classList.remove('visible'), 2000);
                }
            } else {
                const toast = document.getElementById('error-toast');
                if (toast) {
                    toast.textContent = '❌ Erreur MIDI: Autorisez l\'accès MIDI dans votre navigateur.';
                    toast.classList.add('visible');
                    setTimeout(() => toast.classList.remove('visible'), 5000);
                }
            }
        });

        const fOsc = tMidi.addFolder({ title:'📡 OSC (WebSocket)', expanded:false });
        this._oscStatusB = fOsc.addBinding(this.oscState, 'status', { label:'État', readonly:true });
        fOsc.addBinding(this.oscState, 'url', { label:'WS URL' });
        fOsc.addBinding(this.oscState, 'route', { label:'Route' });
        fOsc.addButton({ title:'🔌 Connecter OSC' }).on('click', () => this._connectOsc());
        fOsc.addButton({ title:'🔌 Déconnecter OSC' }).on('click', () => this._disconnectOsc());

        // ════════ SHADERTOY ════════
        this._buildShaderToyTab(tST);

        // ════════ COMPUTE / WEBGPU ════════
        this._buildComputeTab(tCompute);

        // ════════ UNDO / REDO ════════
        const fHist = tScene.addFolder({ title:'↩️ Historique', expanded:false });
        fHist.addButton({ title:'↩️ Undo (Ctrl/Cmd+Z)' }).on('click', () => this.undo());
        fHist.addButton({ title:'↪️ Redo (Ctrl/Cmd+Y)' }).on('click', () => this.redo());

        // ════════ PERF ════════
        this.fpsGraph = tPerf.addBlade({view:'fpsgraph', label:'FPS', lineCount:2});
        this.debugObject.ms = 0;
        tPerf.addBinding(this.debugObject, 'ms', {label:'ms/frame', readonly:true, view:'graph', min:0, max:50});

        this.pane.on('change', () => {
            this._recordHistory();
            try { localStorage.setItem('shaderStudioV5', JSON.stringify({shader:this.debugObject, audio:this.audioDB})); } catch(e) {}
        });
    }

    async _enterXR() {
        try {
            if (!navigator.xr) {
                this._showError('WebXR non supporté sur ce navigateur');
                return;
            }
            if (!this.xrHelper) {
                this.xrHelper = await this.scene.createDefaultXRExperienceAsync({});
            }
            await this.xrHelper.baseExperience.enterXRAsync('immersive-vr', 'local-floor');
            this._showSuccess('🥽 Session VR lancée');
        } catch (e) {
            this._showError(`WebXR erreur: ${e.message}`);
        }
    }

    _connectOsc() {
        this._disconnectOsc();
        try {
            this.oscSocket = new WebSocket(this.oscState.url);
            this.oscState.status = 'Connexion…';
            this._oscStatusB?.refresh();
            this.oscSocket.onopen = () => {
                this.oscState.status = '✅ Connecté';
                this._oscStatusB?.refresh();
            };
            this.oscSocket.onclose = () => {
                this.oscState.status = 'Déconnecté';
                this._oscStatusB?.refresh();
            };
            this.oscSocket.onerror = () => {
                this.oscState.status = '❌ Erreur WS';
                this._oscStatusB?.refresh();
            };
            this.oscSocket.onmessage = (event) => {
                let data;
                try { data = JSON.parse(event.data); } catch { return; }
                const address = data.address || '';
                const args = Array.isArray(data.args) ? data.args : [data.value];
                if (!address.startsWith(this.oscState.route)) return;
                const paramId = address.split('/').pop();
                const value = Number(args[0]);
                const p = params.find(x => x.id === paramId);
                if (!p || Number.isNaN(value)) return;
                const clamped = p.type === 'float'
                    ? Math.min(p.max ?? 1, Math.max(p.min ?? 0, value))
                    : Boolean(value);
                this.debugObject[paramId] = clamped;
                this._applyChange(p, clamped);
                this.pane.refresh();
            };
        } catch (e) {
            this.oscState.status = `❌ ${e.message}`;
            this._oscStatusB?.refresh();
        }
    }

    _disconnectOsc() {
        if (this.oscSocket) {
            this.oscSocket.close();
            this.oscSocket = null;
        }
        this.oscState.status = 'Déconnecté';
        this._oscStatusB?.refresh();
    }

    async _connectMidi() {
        try {
            const ok = await this.midi.init();
            if (ok) {
                console.log('MIDI Ready');
                // Wire MIDI messages to app handler
                this.midi.onMidMessage = (ch, cc, val) => this.onMidiMessage(ch, cc, val);
                return true;
            } else {
                return false;
            }
        } catch (e) {
            console.error('MIDI init error:', e);
            return false;
        }
    }

    // ── MIDI Logic ────────────────────────────────────────────────────────────

    onMidiMessage(ch, cc, val) {
        this.midiState.lastMsg = `Ch:${ch+1} CC:${cc} Val:${val}`;
        if(this._midiMonitor) this._midiMonitor.refresh();

        const key = `${ch}:${cc}`;
        const paramId = this.midi.mappings[key];
        
        if (paramId) {
            const p = params.find(x => x.id === paramId) || audioParams.find(x => x.id === paramId);
            if (p) {
                let newValue;
                const norm = val / 127.0;
                if (p.type === 'float') {
                    const min = p.min !== undefined ? p.min : 0;
                    const max = p.max !== undefined ? p.max : 1;
                    newValue = min + norm * (max - min);
                } else if (p.type === 'boolean') {
                    newValue = val > 64;
                }

                if (p.id in this.debugObject) {
                    this.debugObject[p.id] = newValue;
                    this._applyChange(p, newValue);
                } else if (p.id in this.audioDB) {
                    this.audioDB[p.id] = newValue;
                }
                this.pane.refresh();
                this._recordHistory();
            }
        }
    }

    _mapMidiCC() {
        const { ch, cc } = this.midi.lastMsg;
        if (ch === -1) { alert("Bougez d'abord un contrôleur MIDI !"); return; }
        const key = `${ch}:${cc}`;
        this.midi.mappings[key] = this.midiState.targetParam;
        localStorage.setItem('shaderStudioV5_midi', JSON.stringify(this.midi.mappings));
        alert(`Mappé : CC ${cc} (Ch ${ch+1}) → ${this.midiState.targetParam}`);
    }

    // ── Onglet Export Vidéo ───────────────────────────────────────────────────

    _buildExportTab(tab) {
        const fmts    = this.recorder.getAvailableFormats();
        const compKeys= Object.keys(VideoRecorder.COMPRESSION_PRESETS);
        const resKeys = Object.keys(VideoRecorder.RESOLUTIONS);
        const fmtOpts = Object.fromEntries(fmts.map(f=>[f.label, f.mime]));
        if(!this.videoDB.format && fmts.length) this.videoDB.format=fmts[0].mime;

        const fCfg=tab.addFolder({title:'⚙️ Configuration',expanded:true});
        fCfg.addBinding(this.videoDB,'duration',{label:'Durée (s)',min:1,max:120,step:1});
        if(Object.keys(fmtOpts).length>0){
            fCfg.addBinding(this.videoDB,'format',{label:'Format / Codec',options:fmtOpts});
        }
        fCfg.addBinding(this.videoDB,'compression',{label:'Compression',options:Object.fromEntries(compKeys.map(k=>[k,k]))});
        fCfg.addBinding(this.videoDB,'resolution',{label:'Résolution',options:Object.fromEntries(resKeys.map(k=>[k,k]))});
        fCfg.addBinding(this.videoDB,'fps',{label:'FPS',options:{'24fps':24,'30fps':30,'60fps':60}});

        const fGif = tab.addFolder({title:'🧩 GIF (beta)', expanded:false});
        fGif.addBinding(this._gifState, 'fps', {label:'GIF FPS', min:6, max:24, step:1});
        fGif.addBinding(this._gifState, 'duration', {label:'Durée (s)', min:1, max:10, step:1});
        fGif.addBinding(this._gifState, 'status', {label:'État', readonly:true});
        fGif.addButton({title:'🎞 Export GIF'}).on('click',()=>this._startGifExport());

        const fStatus=tab.addFolder({title:'📹 État',expanded:true});
        this._recStatusB  =fStatus.addBinding(this._recordState,'status',  {label:'État',   readonly:true});
        this._recProgressB=fStatus.addBinding(this._recordState,'progress',{label:'Progress %',readonly:true,view:'graph',min:0,max:100});
        this._recInfoB    =fStatus.addBinding(this._recordState,'info',    {label:'Info',   readonly:true});

        tab.addBlade({view:'separator'});
        const fBtns=tab.addFolder({title:'▶ Contrôles',expanded:true});
        fBtns.addButton({title:'⏺ Démarrer Enregistrement'}).on('click',()=>this._startRecording());
        fBtns.addButton({title:'⏹ Arrêter'}).on('click',()=>{
            this.recorder.stop();
            this._recordState.status='⏹ Arrêté';
            this._recStatusB?.refresh();
        });
    }

    _startGifExport() {
        if (!MediaRecorder.isTypeSupported('image/gif')) {
            this._gifState.status = '⚠️ GIF natif non supporté';
            this._showError('Export GIF non supporté par ce navigateur. Utilisez WebM/MP4.');
            return;
        }
        this._gifState.status = '⏺ Enregistrement GIF…';
        const stream = this.canvas.captureStream(this._gifState.fps);
        const rec = new MediaRecorder(stream, { mimeType: 'image/gif' });
        const chunks = [];
        rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
            const blob = new Blob(chunks, { type: 'image/gif' });
            const url = URL.createObjectURL(blob);
            VideoRecorder.download(url, `shader-studio-${Date.now()}.gif`);
            this._gifState.status = '✅ GIF exporté';
            this.pane?.refresh();
        };
        rec.start(100);
        setTimeout(() => rec.stop(), this._gifState.duration * 1000);
    }

    _startRecording(){
        if(this.recorder.isRecording){ alert('Enregistrement déjà en cours !'); return; }
        const comp   = VideoRecorder.COMPRESSION_PRESETS[this.videoDB.compression] || {};
        const resInfo= VideoRecorder.RESOLUTIONS[this.videoDB.resolution];

        this._recordState.status  ='⏺ Enregistrement…';
        this._recordState.progress=0;
        this._recordState.info    =`${this.videoDB.duration}s · ${this.videoDB.resolution} · ${this.videoDB.compression}`;
        this._recStatusB?.refresh(); this._recProgressB?.refresh(); this._recInfoB?.refresh();

        this.recorder.start({
            duration:          this.videoDB.duration,
            mimeType:          this.videoDB.format || undefined,
            videoBitsPerSecond: comp.videoBitsPerSecond || 8_000_000,
            fps:               this.videoDB.fps || 60,
            resolution:        resInfo || null,
            onProgress:(pct, elapsed, total)=>{
                this._recordState.progress=pct;
                this._recordState.status=`⏺ ${pct}% — ${elapsed.toFixed(1)}s / ${total}s`;
                this._recStatusB?.refresh(); this._recProgressB?.refresh();
            },
            onComplete:(blob, url, filename)=>{
                this._recordState.status  =`✅ Terminé — ${(blob.size/1024/1024).toFixed(1)} Mo`;
                this._recordState.progress=100;
                this._recStatusB?.refresh(); this._recProgressB?.refresh();
                VideoRecorder.download(url, filename);
            },
            onError:(e)=>{
                this._recordState.status='❌ Erreur: '+e.message;
                this._recStatusB?.refresh();
                console.error('Recorder error:',e);
            }
        });
    }

    // ── Onglet ShaderToy ──────────────────────────────────────────────────────

    _buildShaderToyTab(tab) {
        // ── Statut ──
        const fInfo = tab.addFolder({ title: 'ℹ️ Mode ShaderToy', expanded: true });
        const stState = { mode: 'Inactif', fps: '-- FPS', frame: 0 };
        this._stStatusB = fInfo.addBinding(stState, 'mode',  { label: 'État',   readonly: true });
        this._stFpsB    = fInfo.addBinding(stState, 'fps',   { label: 'FPS ST', readonly: true });
        this._stFrameB  = fInfo.addBinding(stState, 'frame', { label: 'Frame',  readonly: true });
        this._stState   = stState;

        // ── Contrôles mode ──
        const fCtrl = tab.addFolder({ title: '▶ Contrôles', expanded: true });
        fCtrl.addButton({ title: '🎮 Activer ShaderToy' }).on('click', () => {
            if (!this.editor) { this._showError('⚠️ Ouvrez l\'éditeur d\'abord (bouton {})'); return; }
            this.enableShaderToy(this.editor.getValue());
            if (this._stStatusB) { stState.mode = '✅ Actif'; this._stStatusB.refresh(); }
        });
        fCtrl.addButton({ title: '🔲 Retour Mode 3D' }).on('click', () => {
            this.disableShaderToy();
            stState.mode = 'Inactif';
            if (this._stStatusB) this._stStatusB.refresh();
        });
        fCtrl.addButton({ title: '⏱ Reset Temps (iTime=0)' }).on('click', () => {
            this._stStartTime = performance.now();
            this._stFrame     = 0;
            this._showSuccess('⏱ iTime remis à zéro');
        });

        // ── Y-flip toggle ──
        const flipObj = { flipY: this._stFlipY };
        const flipBtn = fCtrl.addButton({ title: '↕ Y-Flip : OFF' });
        flipBtn.on('click', () => {
            this._stFlipY      = !this._stFlipY;
            flipObj.flipY      = this._stFlipY;
            flipBtn.title      = `↕ Y-Flip : ${this._stFlipY ? 'ON ✅' : 'OFF'}`;
            // Si le pass est actif, recompiler pour appliquer (le uniform est mis à jour
            // chaque frame via _updateShadertoyUniforms, donc pas besoin de recompiler)
            this._showSuccess(`↕ Y-Flip ${this._stFlipY ? 'activé' : 'désactivé'}`);
        });

        // ── Templates ──
        const fTpl = tab.addFolder({ title: '📋 Templates ShaderToy', expanded: true });
        const tplKeys = Object.keys(SHADERTOY_TEMPLATES);
        const tplObj  = { template: tplKeys[0] };
        fTpl.addBinding(tplObj, 'template', { label: 'Template', options: Object.fromEntries(tplKeys.map(k=>[k,k])) });
        fTpl.addButton({ title: '📂 Charger dans l\'éditeur' }).on('click', () => {
            if (!this.editor) { this._showError('⚠️ Ouvrez l\'éditeur d\'abord'); return; }
            this.editor.setValue(SHADERTOY_TEMPLATES[tplObj.template]);
            this._showSuccess(`✅ Template "${tplObj.template}" chargé`);
        });
        fTpl.addButton({ title: '📂 Charger + Activer' }).on('click', () => {
            if (!this.editor) { this._showError('⚠️ Ouvrez l\'éditeur d\'abord'); return; }
            const code = SHADERTOY_TEMPLATES[tplObj.template];
            this.editor.setValue(code);
            this.enableShaderToy(code);
            stState.mode = '✅ Actif';
            if (this._stStatusB) this._stStatusB.refresh();
        });

        // ── Uniforms ShaderToy disponibles ──
        const fRef = tab.addFolder({ title: '📖 Référence Uniforms', expanded: false });
        const refInfo = {
            info: [
                'iTime       float  — temps (s)',
                'iResolution vec3   — taille canvas',
                'iMouse      vec4   — xy=pos zw=click',
                'iFrame      int    — n° frame',
                'iDate       vec4   — année/mois/jour/s',
                'iTimeDelta  float  — delta frame (s)',
                'iFrameRate  float  — FPS',
                'iSampleRate float  — 44100',
                'iChannel0   sampler2D — FFT audio',
                'iChannel1   sampler2D — texture',
                'iChannel2   sampler2D — matcap',
                'iChannel3   sampler2D — texture',
                '── Bonus ──────────────────',
                'uBass  uMid  uHigh  uOverall',
            ].join('\n')
        };
        fRef.addBinding(refInfo, 'info', { label: 'Uniforms', readonly: true, multiline: true, rows: 16 });

        // ── Tips ──
        tab.addBlade({ view: 'separator' });
        const tips = tab.addFolder({ title: '💡 Guide', expanded: false });
        const tipsText = { t: '1. Collez votre code ShaderToy dans l\'éditeur ({})\n2. Le mode est détecté automatiquement (badge orange)\n3. Ctrl+S compile et active\n4. iChannel0 = FFT audio en temps réel\n5. uBass/uMid/uHigh = niveaux audio (0-1)\n6. mainImage(out vec4, in vec2) requis' };
        tips.addBinding(tipsText, 't', { label: 'Aide', readonly: true, multiline: true, rows: 8 });
    }

    _downloadTextFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    _buildComputeTab(tab) {
        const fState = tab.addFolder({ title: 'ℹ️ WebGPU', expanded: true });
        fState.addBinding(this._computeState, 'supported', { label: 'Support', readonly: true });
        this._computeStatusBinding = fState.addBinding(this._computeState, 'status', { label: 'État', readonly: true });
        fState.addBinding(this._computeState, 'sample', { label: 'Sample', readonly: true });

        const fRun = tab.addFolder({ title: '⚙️ Simulation GPU', expanded: true });
        fRun.addBinding(this._computeState, 'particles', { label: 'Particules', min: 256, max: 65536, step: 256 });

        fRun.addButton({ title: '▶ Lancer 1 step compute' }).on('click', async () => {
            if (!WebGPUCompute.isSupported()) {
                this._computeState.status = 'WebGPU indisponible';
                this._computeStatusBinding?.refresh();
                this._showError('WebGPU non supporté sur ce navigateur');
                return;
            }

            try {
                this._computeState.status = 'Exécution…';
                this._computeStatusBinding?.refresh();
                const out = await this.webgpuCompute.runParticleSimulation({ particleCount: this._computeState.particles, deltaTime: 0.016 });
                this._computeState.status = `OK (${out.particleCount} particules)`;
                this._computeState.sample = `${out.sample.x.toFixed(3)}, ${out.sample.y.toFixed(3)}`;
                this._showSuccess('🧪 Step compute WebGPU exécuté');
            } catch (err) {
                this._computeState.status = 'Erreur';
                this._showError(`Compute shader: ${err.message}`);
            } finally {
                this._computeStatusBinding?.refresh();
                this.pane?.refresh();
            }
        });

        fRun.addButton({ title: '🚀 Export conversion Shadertoy' }).on('click', () => {
            const code = buildShadertoyExport(this.debugObject);
            this._downloadTextFile(`shadertoy-export-${Date.now()}.glsl`, code);
            this._showSuccess('🚀 Fichier Shadertoy exporté');
        });
    }

    // ── Bloom radius helpers ──────────────────────────────────────────────────
    // bloomRadius ∈ [0, 1] → kernel et scale perceptuellement linéaires.
    // kernel exponentiel : r=0 → 16px, r=0.5 → 64px, r=1 → 256px
    // scale  linéaire    : r=0 → 0.2 (serré),          r=1 → 1.0 (étalé)

    _bloomKernelFromRadius(r) {
        return Math.round(16 * Math.pow(16, r)); // 16^(1+r)
    }

    _bloomScaleFromRadius(r) {
        return 0.2 + r * 0.8;
    }

    _bind(folder,id,customCb=null){
        const p=params.find(x=>x.id===id); if(!p) return;
        const opts={label:p.name};
        if(p.min!==undefined) opts.min=p.min;
        if(p.max!==undefined) opts.max=p.max;
        if(p.options!==undefined) opts.options=p.options;
        folder.addBinding(this.debugObject,id,opts).on('change',ev=>{ if(customCb){customCb(ev);return;} this._applyChange(p,ev.value); });
    }
    _bindA(folder,id,customCb=null){
        const p=audioParams.find(x=>x.id===id); if(!p) return;
        const opts={label:p.name};
        if(p.min!==undefined) opts.min=p.min;
        if(p.max!==undefined) opts.max=p.max;
        if(p.options!==undefined) opts.options=p.options;
        folder.addBinding(this.audioDB,id,opts).on('change',ev=>{ if(customCb) customCb(ev); });
    }

    _applyChange(p,val){
        switch(p.id){
            case 'geometryType':  this.updateGeometry(val); return;
            case 'noiseType': {
                const code = this.editor ? this.editor.getValue() : null;
                if (code && App.detectShaderToy(code)) {
                    // En mode ShaderToy, le noise chunk 3D ne s'applique pas.
                    this.compileShadertoy(code);
                    return;
                }
                this._createShaderMaterial(val, this.currentTexture, this.currentMatcap, code);
                return;
            }
            case 'wireframe':     this.material.wireframe=val; return;
            case 'cyberpunkMode': this.pipeline.chromaticAberrationEnabled=val; return;
            case 'glitchMode':
                if (val) this.camera.attachPostProcess(this.glitchPass);
                else     this.camera.detachPostProcess(this.glitchPass);
                return;
            case 'pixelMode':     /* handled in bind */ return;
            case 'vignetteMode':  /* handled in bind */ return;
            case 'bloomStrength': this.pipeline.bloomWeight=val * 0.5; return;
            case 'bloomThreshold':this.pipeline.bloomThreshold=val; return;
            case 'bgColor':       this.scene.clearColor = new BABYLON.Color4(val.r/255, val.g/255, val.b/255, 1); return;
            case 'autoRotate': case 'rotationSpeed': return;
        }
        
        // Uniforms update
        if(p.type==='color') this.material.setColor3(p.id, hexToColor3(val));
        else if(p.type==='float') this.material.setFloat(p.id, val);
    }

    _updateMaterialUniforms() {
        const skipTypes = new Set(['select','boolean']);
        const skipIds   = new Set(['wireframe','bgColor','geometryType','cyberpunkMode','glitchMode',
            'pixelMode','vignetteMode','autoRotate','rotationSpeed','bloomStrength','bloomRadius',
            'bloomThreshold','glitchAmount','pixelSize','vignetteAmount','noiseType']);

        params.forEach(p=>{
            if(skipTypes.has(p.type)||skipIds.has(p.id)) return;
            const val=this.debugObject[p.id];
            if(p.type==='color') this.material.setColor3(p.id, hexToColor3(val));
            else this.material.setFloat(p.id, val);
        });
    }

    // ── Animate ───────────────────────────────────────────────────────────────

    animate(){
        if(this.fpsGraph) this.fpsGraph.begin();
        const t0=performance.now();

        // Sync audio engine params BEFORE update so current frame uses correct values
        this.audio.gains.bass      = this.audioDB.gainBass;
        this.audio.gains.mid       = this.audioDB.gainMid;
        this.audio.gains.high      = this.audioDB.gainHigh;
        this.audio.smoothing.bass  = this.audioDB.smoothBass;
        this.audio.smoothing.mid   = this.audioDB.smoothMid;
        this.audio.smoothing.high  = this.audioDB.smoothHigh;
        this.audio.sensitivity     = this.audioDB.sensitivity;
        this.audio.beatThreshold   = this.audioDB.beatThreshold;

        this.audio.update();
        const av=this.audio.values;

        // Live levels
        this.debugObject._bass   =av.bass;
        this.debugObject._mid    =av.mid;
        this.debugObject._high   =av.high;
        this.debugObject._overall=av.overall;

        // Uniforms audio
        this.material.setFloat("uBass", av.bass);
        this.material.setFloat("uMid", av.mid);
        this.material.setFloat("uHigh", av.high);
        this.material.setFloat("uOverall", av.overall);
        this._applyAudioMapping(av);

        // Beat flash bloom
        if(this._beatFlash>0){ 
            this._beatFlash--; 
            this.pipeline.bloomWeight = (this.debugObject.bloomStrength * 0.5) * (1 + this._beatFlash * 0.5);
        } else { 
            this.pipeline.bloomWeight = this.debugObject.bloomStrength * 0.5; 
        }

        // Souris
        this.mouse = BABYLON.Vector2.Lerp(this.mouse, this.targetMouse, 0.06);
        this.material.setVector2("uMouse", this.mouse);

        // Auto-rotation
        if(this.debugObject.autoRotate && this.mesh){
            this.mesh.rotation.y += 0.005 * this.debugObject.rotationSpeed;
            this.mesh.rotation.x += 0.002 * this.debugObject.rotationSpeed;
        }

        this.material.setFloat("uTime", performance.now() / 1000);

        if(this.pipeline.chromaticAberrationEnabled){
            this.pipeline.chromaticAberration.aberrationAmount = (0.002 + av.bass * 0.015) * 100; // Scale for Babylon
        }

        this.debugObject.ms=performance.now()-t0;
        if(this.fpsGraph) this.fpsGraph.end();

        // Update ShaderToy panel status
        if (this._stState && this.shadertoyMode) {
            this._stState.fps   = Math.round(this.engine.getFps()) + ' FPS';
            this._stState.frame = this._stFrame;
            if (this._stFpsB)   this._stFpsB.refresh();
            if (this._stFrameB) this._stFrameB.refresh();
        }
    }

    _applyAudioMapping(av){
        const db = this.audioDB;

        // Displacement uniforms: base value + audio contribution if mapped
        this.material.setFloat("uBassDisplace",
            this.debugObject.uBassDisplace + (db.mapBassTo === 'displacement' ? av.bass * db.gainBass : 0));
        this.material.setFloat("uMidDisplace",
            this.debugObject.uMidDisplace  + (db.mapMidTo  === 'displacement' ? av.mid  * db.gainMid  : 0));
        this.material.setFloat("uHighDisplace",
            this.debugObject.uHighDisplace + (db.mapHighTo === 'displacement' ? av.high * db.gainHigh : 0));

        // Speed mapping: add audio contribution on top of base uSpeed
        let speedMod = 0;
        if (db.mapBassTo === 'speed') speedMod += av.bass * db.gainBass;
        if (db.mapMidTo  === 'speed') speedMod += av.mid  * db.gainMid;
        if (db.mapHighTo === 'speed') speedMod += av.high * db.gainHigh;
        this.material.setFloat("uSpeed", this.debugObject.uSpeed + speedMod);

        // Scale mapping: add audio contribution on top of base uScale
        let scaleMod = 0;
        if (db.mapBassTo === 'scale') scaleMod += av.bass * db.gainBass;
        if (db.mapMidTo  === 'scale') scaleMod += av.mid  * db.gainMid;
        if (db.mapHighTo === 'scale') scaleMod += av.high * db.gainHigh;
        this.material.setFloat("uScale", this.debugObject.uScale + scaleMod);
    }

    // ── Géométrie ────────────────────────────────────────────────────────────

    updateGeometry(type){
        if(this.mesh) this.mesh.dispose();
        
        const opts = { updatable: true };
        let mesh;

        // Helper pour créer des tubes à partir de fonctions
        const createTube = (pathFn, size=200) => {
            const path = [];
            for(let i=0; i<=size; i++) {
                const t = i/size;
                path.push(pathFn(t));
            }
            return BABYLON.MeshBuilder.CreateTube("tube", {path: path, radius: 0.12, sideOrientation: BABYLON.Mesh.DOUBLESIDE}, this.scene);
        };

        switch(type){
            case 'plane':          mesh = BABYLON.MeshBuilder.CreatePlane("plane", {size: 2, sideOrientation: BABYLON.Mesh.DOUBLESIDE}, this.scene); break;
            case 'sphere':         mesh = BABYLON.MeshBuilder.CreateSphere("sphere", {diameter: 2, segments: 64}, this.scene); break;
            case 'torus':          mesh = BABYLON.MeshBuilder.CreateTorus("torus", {diameter: 1.6, thickness: 0.7, tessellation: 64}, this.scene); break;
            case 'torusknot':      mesh = BABYLON.MeshBuilder.CreateTorusKnot("knot", {radius: 0.6, tube: 0.22, radialSegments: 128, tubularSegments: 32}, this.scene); break;
            case 'icosahedron':    mesh = BABYLON.MeshBuilder.CreatePolyhedron("ico", {type: 3, size: 1}, this.scene); break;
            case 'octahedron':     mesh = BABYLON.MeshBuilder.CreatePolyhedron("oct", {type: 1, size: 1}, this.scene); break;
            case 'dodecahedron':   mesh = BABYLON.MeshBuilder.CreatePolyhedron("dod", {type: 2, size: 1}, this.scene); break;
            case 'cone':           mesh = BABYLON.MeshBuilder.CreateCylinder("cone", {diameterTop: 0, diameterBottom: 1.6, height: 2, tessellation: 64}, this.scene); break;
            case 'cylinder':       mesh = BABYLON.MeshBuilder.CreateCylinder("cyl", {diameter: 1.2, height: 2, tessellation: 64}, this.scene); break;
            case 'capsule':        mesh = BABYLON.MeshBuilder.CreateCapsule("cap", {radius: 0.5, height: 2.2, tessellation: 32}, this.scene); break;
            
            // Géométries procédurales converties
            case 'trefoil':
                mesh = createTube(t => {
                    const a=t*Math.PI*2; 
                    return new BABYLON.Vector3(Math.sin(a)+2*Math.sin(2*a), Math.cos(a)-2*Math.cos(2*a), -Math.sin(3*a)).scale(0.35);
                });
                break;
            case 'klein':
                mesh = createTube(t => {
                    const u=t*Math.PI*4;
                    const x=(2+Math.cos(u/2)*Math.sin(u)-Math.sin(u/2)*Math.sin(2*u))*0.4;
                    const y=(2+Math.cos(u/2)*Math.sin(u)+Math.sin(u/2)*Math.sin(2*u))*0.4;
                    const z=Math.sin(u/2)*Math.cos(u)*0.6;
                    return new BABYLON.Vector3(x,y,z);
                }, 300);
                break;
            case 'spring':
                mesh = createTube(t => {
                    const a=t*Math.PI*16; 
                    return new BABYLON.Vector3(Math.cos(a)*.7, t*2-1, Math.sin(a)*.7);
                }, 400);
                break;
            case 'heart':
                mesh = createTube(t => {
                    const a=t*Math.PI*2; 
                    return new BABYLON.Vector3(16*Math.pow(Math.sin(a),3), (13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a)), 0).scale(0.06);
                });
                break;
            
            // ── Möbius Strip ─────────────────────────────────────────────────
            case 'mobius': {
                const uSegs = 120, vSegs = 24;
                const positions = [], normals = [], uvs = [], indices = [];
                for (let i = 0; i <= uSegs; i++) {
                    const u = (i / uSegs) * Math.PI * 2;
                    for (let j = 0; j <= vSegs; j++) {
                        const v = (j / vSegs - 0.5) * 1.0; // -0.5 .. 0.5
                        const x = (1 + v * 0.5 * Math.cos(u / 2)) * Math.cos(u);
                        const y = (1 + v * 0.5 * Math.cos(u / 2)) * Math.sin(u);
                        const z = v * 0.5 * Math.sin(u / 2);
                        positions.push(x, y, z);
                        uvs.push(i / uSegs, j / vSegs);
                        // Normal par différence finie
                        const du = 0.001;
                        const u2 = u + du;
                        const nx2 = (1 + v*0.5*Math.cos(u2/2))*Math.cos(u2) - x;
                        const ny2 = (1 + v*0.5*Math.cos(u2/2))*Math.sin(u2) - y;
                        const nz2 = v*0.5*Math.sin(u2/2) - z;
                        const dv = 0.001;
                        const v2 = v + dv;
                        const mx2 = 0.5*Math.cos(u/2)*Math.cos(u)*dv;
                        const my2 = 0.5*Math.cos(u/2)*Math.sin(u)*dv;
                        const mz2 = 0.5*Math.sin(u/2)*dv;
                        // Cross product
                        const cx = ny2*mz2 - nz2*my2;
                        const cy = nz2*mx2 - nx2*mz2;
                        const cz = nx2*my2 - ny2*mx2;
                        const cl = Math.sqrt(cx*cx+cy*cy+cz*cz) || 1;
                        normals.push(cx/cl, cy/cl, cz/cl);
                    }
                }
                for (let i = 0; i < uSegs; i++) {
                    for (let j = 0; j < vSegs; j++) {
                        const a = i*(vSegs+1)+j, b = a+1, c = a+(vSegs+1), d = c+1;
                        indices.push(a,b,c, b,d,c);
                    }
                }
                const vd = new BABYLON.VertexData();
                vd.positions = positions; vd.normals = normals;
                vd.uvs = uvs; vd.indices = indices;
                mesh = new BABYLON.Mesh("mobius", this.scene);
                vd.applyToMesh(mesh);
                break;
            }

            // ── Super Ellipsoid ──────────────────────────────────────────────
            case 'superellipsoid': {
                const n1 = 0.4, n2 = 0.4; // exposants < 1 = forme cubique arrondie
                const uS = 64, vS = 64;
                const positions = [], normals = [], uvs = [], indices = [];
                const cpow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
                for (let i = 0; i <= uS; i++) {
                    const phi = (i / uS - 0.5) * Math.PI; // -pi/2 .. pi/2
                    for (let j = 0; j <= vS; j++) {
                        const theta = (j / vS) * Math.PI * 2;
                        const x = cpow(Math.cos(phi), n1) * cpow(Math.cos(theta), n2);
                        const y = cpow(Math.sin(phi), n1);
                        const z = cpow(Math.cos(phi), n1) * cpow(Math.sin(theta), n2);
                        positions.push(x, y, z);
                        uvs.push(j / vS, i / uS);
                        // Normal = gradient de la surface implicite
                        const nx = cpow(Math.cos(phi), 2-n1) * cpow(Math.cos(theta), 2-n2);
                        const ny = cpow(Math.sin(phi), 2-n1);
                        const nz = cpow(Math.cos(phi), 2-n1) * cpow(Math.sin(theta), 2-n2);
                        const nl = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
                        normals.push(nx/nl, ny/nl, nz/nl);
                    }
                }
                for (let i = 0; i < uS; i++) {
                    for (let j = 0; j < vS; j++) {
                        const a = i*(vS+1)+j, b = a+1, c = a+(vS+1), d = c+1;
                        indices.push(a,c,b, b,c,d);
                    }
                }
                const vd = new BABYLON.VertexData();
                vd.positions = positions; vd.normals = normals;
                vd.uvs = uvs; vd.indices = indices;
                mesh = new BABYLON.Mesh("superellipsoid", this.scene);
                vd.applyToMesh(mesh);
                break;
            }

            // ── Gear (Engrenage) ─────────────────────────────────────────────
            case 'gear': {
                const teeth = 16, r1 = 0.75, r2 = 1.0, r3 = 0.35; // inner, outer, bore
                const depth = 0.3;
                const positions = [], normals = [], uvs = [], indices = [];
                const totalSegs = teeth * 4; // 4 segments par dent

                const addRing = (y, sign) => {
                    for (let i = 0; i < totalSegs; i++) {
                        const angle0 = (i / totalSegs) * Math.PI * 2;
                        // Profil d'engrenage : alterné intérieur/extérieur
                        const phase = (i % 4) / 4.0;
                        const r = (phase < 0.5)
                            ? r1 + (r2 - r1) * Math.sin(phase * Math.PI * 2) // montée/descente de dent
                            : r1;
                        positions.push(Math.cos(angle0)*r, y, Math.sin(angle0)*r);
                        normals.push(Math.cos(angle0)*sign, 0, Math.sin(angle0)*sign);
                        uvs.push(i/totalSegs, (y+depth)/(depth*2));
                    }
                };

                // Face avant
                const base0 = positions.length / 3;
                addRing( depth, 1);
                // Face arrière
                const base1 = positions.length / 3;
                addRing(-depth, -1);

                // Connecter les deux faces (côtés)
                for (let i = 0; i < totalSegs; i++) {
                    const next = (i + 1) % totalSegs;
                    const a = base0 + i, b = base0 + next;
                    const c = base1 + i, d = base1 + next;
                    indices.push(a,b,c, b,d,c);
                }

                // Bouchon face avant (fan depuis centre)
                const cf = positions.length / 3;
                positions.push(0, depth, 0); normals.push(0,1,0); uvs.push(0.5,0.5);
                for (let i = 0; i < totalSegs; i++) {
                    indices.push(cf, base0 + i, base0 + (i+1) % totalSegs);
                }
                // Bouchon face arrière
                const cb = positions.length / 3;
                positions.push(0, -depth, 0); normals.push(0,-1,0); uvs.push(0.5,0.5);
                for (let i = 0; i < totalSegs; i++) {
                    indices.push(cb, base1 + (i+1)%totalSegs, base1 + i);
                }

                const vd = new BABYLON.VertexData();
                vd.positions = positions; vd.normals = normals;
                vd.uvs = uvs; vd.indices = indices;
                mesh = new BABYLON.Mesh("gear", this.scene);
                vd.applyToMesh(mesh);
                break;
            }

            // ── Ring / Lathe ─────────────────────────────────────────────────
            case 'ring':
                mesh = BABYLON.MeshBuilder.CreateTorus("ring", {diameter: 1.8, thickness: 0.4, tessellation: 64}, this.scene);
                break;
            case 'lathe': {
                const shape = [];
                for (let i = 0; i <= 20; i++) {
                    const t = i / 20;
                    const r = 0.2 + 0.6 * Math.sin(t * Math.PI) + 0.2 * Math.sin(t * Math.PI * 3);
                    shape.push(new BABYLON.Vector3(r, t * 2 - 1, 0));
                }
                mesh = BABYLON.MeshBuilder.CreateLathe("lathe", {shape, tessellation: 48, sideOrientation: BABYLON.Mesh.DOUBLESIDE}, this.scene);
                break;
            }

            // ── Nœuds ────────────────────────────────────────────────────────
            case 'knot23':
                mesh = BABYLON.MeshBuilder.CreateTorusKnot("k23", {radius:0.7, tube:0.18, radialSegments:256, tubularSegments:32, p:2, q:3}, this.scene);
                break;
            case 'knot35':
                mesh = BABYLON.MeshBuilder.CreateTorusKnot("k35", {radius:0.7, tube:0.14, radialSegments:256, tubularSegments:32, p:3, q:5}, this.scene);
                break;

            default:
                mesh = BABYLON.MeshBuilder.CreateSphere("sphere", {diameter: 2, segments: 64}, this.scene);
        }

        this.mesh = mesh;
        this.mesh.material = this.material;
    }

    applyPreset(name){
        const preset=PRESETS[name]; if(!preset) return;
        Object.entries(preset).forEach(([k,v])=>{
            this.debugObject[k]=v;
            const p=params.find(x=>x.id===k);
            if(p) this._applyChange(p,v);
        });
        this.pane.refresh();
        this._recordHistory();
    }

    // ── Divers ───────────────────────────────────────────────────────────────

    onResize(){
        this.engine.resize();
        const w=this.canvas.width, h=this.canvas.height;
        this.material.setVector2("uResolution", new BABYLON.Vector2(w, h));
    }
    onMouseMove(e){ 
        this.targetMouse.x = e.clientX / this.canvas.width; 
        this.targetMouse.y = 1 - e.clientY / this.canvas.height; 
    }
    
    onDragEnter(e) {
        e.preventDefault();
        this._dragDepth++;
        this.canvas.classList.add('drag-over');
    }

    onDragLeave(e) {
        e.preventDefault();
        this._dragDepth = Math.max(0, this._dragDepth - 1);
        if (this._dragDepth === 0) this.canvas.classList.remove('drag-over');
    }

    onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }

    onDrop(e){
        e.preventDefault();
        this._dragDepth = 0;
        this.canvas.classList.remove('drag-over');
        if(!e.dataTransfer.files.length) return;

        const files = Array.from(e.dataTransfer.files);
        const imageFile = files.find(f => f.type.startsWith('image/'));
        const audioFile = files.find(f => f.type.startsWith('audio/'));
        const videoFile = files.find(f => f.type.startsWith('video/'));

        if(imageFile){
            const url = URL.createObjectURL(imageFile);
            const tex = new BABYLON.Texture(url, this.scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, ()=>{
                this._showSuccess(`🖼 Texture chargée: ${imageFile.name}`);
                URL.revokeObjectURL(url);
            });
            this.material.setTexture("uTexture", tex);
            this.currentTexture = tex;
        }

        if(audioFile){
            this._playerState.file=audioFile.name;
            this._playerState.status='⏳ Chargement…'; this.pane.refresh();
            this.audio.loadFile(audioFile).then(()=>{
                this.audio.play();
                this._playerState.status='▶ Lecture'; this.pane.refresh();
                this._showSuccess(`🎵 Audio chargé: ${audioFile.name}`);
            });
        }

        if (videoFile) {
            this._setVideoTextureFromFile(videoFile).catch(err => this._showError(`Vidéo invalide: ${err.message}`));
        }

        if (!imageFile && !audioFile && !videoFile) {
            this._showError('⚠️ Formats supportés: image/*, video/* et audio/*');
        }
    }

    onKeyDown(e) {
        const isMod = e.ctrlKey || e.metaKey;
        if (!isMod) return;

        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
            return;
        }
        if (key === 'y' || (key === 'z' && e.shiftKey)) {
            e.preventDefault();
            this.redo();
        }
    }

    toggleUI(){ document.getElementById('ui-container').classList.toggle('hidden'); }
    toggleEditor(){ document.getElementById('editor-container').classList.toggle('hidden'); }
    toggleFullscreen(){ if(!document.fullscreenElement) this.canvas.requestFullscreen().catch(()=>{}); else document.exitFullscreen(); }

    hideLoader(){
        const l=document.getElementById('loader'); if(!l) return;
        setTimeout(()=>{ l.style.opacity='0'; setTimeout(()=>l.style.display='none',800); },600);
    }

    saveScreenshot(transparent = false){
        if (!transparent) {
            BABYLON.Tools.CreateScreenshot(this.engine, this.camera, { precision: 2 });
            return;
        }

        const prev = this.scene.clearColor.clone();
        this.scene.clearColor = new BABYLON.Color4(prev.r, prev.g, prev.b, 0);
        BABYLON.Tools.CreateScreenshot(this.engine, this.camera, { precision: 2 });
        this.scene.clearColor = prev;
        this._showSuccess('🪟 PNG transparent exporté');
    }

    _copyConfig(){
        const out={}; params.forEach(p=>{out[p.id]=this.debugObject[p.id];});
        navigator.clipboard.writeText(JSON.stringify(out,null,2)).then(()=>alert('Config copiée !'));
    }

    generateCode(){
        // Affiche le code actuel de l'éditeur ou le défaut
        document.getElementById('glsl-code').textContent = this.editor ? this.editor.getValue() : fragmentShaderMain;
        document.getElementById('code-modal').style.display='flex';
    }

    setupErrorHandler(){
        window.addEventListener("error", (e) => {
            this._showError('⚠️ ' + e.message);
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ── ShaderToy Compatibility Layer ────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Détecte automatiquement si un code source utilise les conventions ShaderToy.
     * Critères : présence de mainImage, iTime, iResolution, iMouse...
     */
    static detectShaderToy(code) {
        return /mainImage\s*\(/.test(code) ||
               /\biResolution\b/.test(code) ||
               /\biTime\b/.test(code) ||
               /\biMouse\b/.test(code) ||
               /\biFrame\b/.test(code) ||
               /\biChannel\d\b/.test(code);
    }

    /**
     * Transforme le source ShaderToy en fragment shader Babylon-compatible.
     * Injecte tous les uniforms ST + wrapper void main().
     */
    _buildShaderToySource(userCode) {
        const header = `
precision highp float;
precision highp int;

// ── ShaderToy Standard Uniforms ──────────────────────────────────────────────
uniform vec3      iResolution;           // viewport res (px), z=pixel ratio
uniform float     iTime;                 // shader playback time (s)
uniform float     iTimeDelta;            // render time (s)
uniform float     iFrameRate;            // shader FPS
uniform int       iFrame;                // shader playback frame
uniform vec4      iDate;                 // (year, month, day, time in s)
uniform vec4      iMouse;                // mouse pixel coords (xy=cur, zw=click)
uniform float     iSampleRate;           // sound sample rate (44100)

// Channels — textures
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

// Channel resolutions
uniform vec3  iChannelResolution[4];
uniform float iChannelTime[4];

// Babylon PostProcess standard
varying vec2 vUV;

// ── Audio reactive custom uniforms (bonus) ───────────────────────────────────
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uOverall;

// ── Y-flip correctif (Babylon PostProcess inversion) ─────────────────────────
uniform int uFlipY;   // 0 = normal, 1 = flip Y

// ── Compatibility macros ──────────────────────────────────────────────────────
// textureLod polyfill (WebGL1 friendly)
#define texture texture2D

// ─────────────────────────────────────────────────────────────────────────────
// User ShaderToy Code
// ─────────────────────────────────────────────────────────────────────────────
${userCode}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point → Babylon gl_FragColor
// ─────────────────────────────────────────────────────────────────────────────
void main(void) {
    vec2 uv = vUV;
    if (uFlipY == 1) uv.y = 1.0 - uv.y;
    vec2 fragCoord = uv * iResolution.xy;

    vec4 fragColor = vec4(0.0);
    mainImage(fragColor, fragCoord);
    gl_FragColor = fragColor;
}
`;
        return header;
    }

    /**
     * Crée/recrée le PostProcess ShaderToy fullscreen.
     * @param {string} userCode  Code source brut de l'utilisateur
     */
    compileShadertoy(userCode) {
        this.shadertoyCode = userCode;

        // Nettoyage de l'ancien pass
        if (this.shadertoyPass) {
            this.shadertoyPass.dispose();
            this.shadertoyPass = null;
        }
        // Supprimer l'effet précédent du store pour forcer la recompilation
        delete BABYLON.Effect.ShadersStore['shadertoyFragmentShader'];

        const fragmentSrc = this._buildShaderToySource(userCode);
        BABYLON.Effect.ShadersStore['shadertoyFragmentShader'] = fragmentSrc;

        // Uniforms et samplers déclarés
        const uniforms  = [
            'iResolution','iTime','iTimeDelta','iFrameRate','iFrame',
            'iDate','iMouse','iSampleRate',
            'iChannelTime','iChannelResolution',
            'uBass','uMid','uHigh','uOverall','uFlipY',
        ];
        const samplers = ['iChannel0','iChannel1','iChannel2','iChannel3'];

        this.shadertoyPass = new BABYLON.PostProcess(
            'shadertoy', 'shadertoy',
            uniforms, samplers,
            1.0, this.camera
        );

        // Initialiser la texture FFT pour iChannel0
        this._initFFTTexture();

        this.shadertoyPass.onApply = (effect) => {
            this._updateShadertoyUniforms(effect);
        };

        this.shadertoyPass.onError = (effect, errors) => {
            this._showError('❌ ShaderToy: ' + errors);
            console.error('ShaderToy compile error:', errors);
        };

        // Désactiver le rendu 3D quand ST est actif (mesh caché)
        if (this.mesh) this.mesh.isVisible = !this.shadertoyMode;
    }

    /**
     * Met à jour tous les uniforms ShaderToy à chaque frame.
     */
    _updateShadertoyUniforms(effect) {
        const now   = performance.now();
        const iTime = (now - this._stStartTime) / 1000.0;
        this._stTimeDelta = (now - this._stLastTime) / 1000.0;
        this._stLastTime  = now;

        const w = this.canvas.width;
        const h = this.canvas.height;

        // iResolution
        effect.setVector3('iResolution', new BABYLON.Vector3(w, h, 1.0));

        // iTime / iTimeDelta / iFrameRate / iFrame
        effect.setFloat ('iTime',      iTime);
        effect.setFloat ('iTimeDelta', this._stTimeDelta);
        effect.setFloat ('iFrameRate', this.engine.getFps());
        effect.setInt   ('iFrame',     this._stFrame++);

        // iDate (year, month, day, seconds since midnight)
        const d = new Date();
        effect.setVector4('iDate', new BABYLON.Vector4(
            d.getFullYear(),
            d.getMonth(),      // 0-based comme ShaderToy
            d.getDate(),
            d.getHours()*3600 + d.getMinutes()*60 + d.getSeconds() + d.getMilliseconds()/1000
        ));

        // iMouse
        effect.setVector4('iMouse', new BABYLON.Vector4(
            this._stMouse.x, this._stMouse.y,
            this._stMouseDown ? this._stMouse.z : -Math.abs(this._stMouse.z),
            this._stMouseDown ? this._stMouse.w : -Math.abs(this._stMouse.w)
        ));

        // iSampleRate
        effect.setFloat('iSampleRate', 44100.0);

        // iChannelResolution (4 canaux — on remplit avec les dims du canvas)
        // Babylon ne supporte pas setArray directement pour vec3[], on passe via float[]
        const chanRes = [
            w, h, 1,   // channel 0
            w, h, 1,   // channel 1
            w, h, 1,   // channel 2
            w, h, 1,   // channel 3
        ];
        effect.setArray3('iChannelResolution', chanRes);
        effect.setArray ('iChannelTime',       [iTime, iTime, iTime, iTime]);

        // Y-flip correctif
        effect.setInt('uFlipY', this._stFlipY ? 1 : 0);

        // iChannel0 = FFT audio texture
        if (this._fftTexture) {
            this._updateFFTTexture();
            effect.setTexture('iChannel0', this._fftTexture);
        } else {
            effect.setTexture('iChannel0', this.currentTexture);
        }
        // iChannel1-3 → texture par défaut ou null
        effect.setTexture('iChannel1', this.currentTexture);
        effect.setTexture('iChannel2', this.currentMatcap);
        effect.setTexture('iChannel3', this.currentTexture);

        // Audio reactive
        const av = this.audio.values;
        effect.setFloat('uBass',    av.bass);
        effect.setFloat('uMid',     av.mid);
        effect.setFloat('uHigh',    av.high);
        effect.setFloat('uOverall', av.overall);
    }

    /**
     * Crée un canvas 512×2 → DynamicTexture pour stocker les données FFT.
     * Rangée 0 : fréquences (0-255), rangée 1 : waveform (0-255)
     * Compatible avec ShaderToy iChannel0 audio pattern.
     */
    _initFFTTexture() {
        const W = 512, H = 2;
        this._fftCanvas = document.createElement('canvas');
        this._fftCanvas.width  = W;
        this._fftCanvas.height = H;
        this._fftCtx = this._fftCanvas.getContext('2d');

        // Fond gris neutre (128 = silence)
        this._fftCtx.fillStyle = 'rgb(128,128,128)';
        this._fftCtx.fillRect(0, 0, W, H);

        this._fftTexture = new BABYLON.DynamicTexture(
            'fftTex', { width: W, height: H }, this.scene, false
        );
    }

    _updateFFTTexture() {
        if (!this._fftCtx || !this._fftTexture) return;
        const fftData = this.audio.getFFTData();
        if (!fftData) return;

        const ctx = this._fftCtx;
        const W   = this._fftCanvas.width;

        // Rangée 0 : spectre fréquentiel
        const imgData = ctx.createImageData(W, 1);
        for (let i = 0; i < W; i++) {
            const v = fftData[Math.floor(i * fftData.length / W)];
            imgData.data[i*4+0] = v;
            imgData.data[i*4+1] = v;
            imgData.data[i*4+2] = v;
            imgData.data[i*4+3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);

        // Rangée 1 : waveform (approximée depuis les niveaux bande)
        const wave = ctx.createImageData(W, 1);
        for (let i = 0; i < W; i++) {
            const t   = i / W;
            const val = Math.floor(128 + 127 * (
                this.audio.values.bass    * Math.sin(t * Math.PI * 4  + performance.now()/600) * 0.5 +
                this.audio.values.mid     * Math.sin(t * Math.PI * 12 + performance.now()/300) * 0.3 +
                this.audio.values.high    * Math.sin(t * Math.PI * 30 + performance.now()/150) * 0.2
            ));
            wave.data[i*4+0] = val;
            wave.data[i*4+1] = val;
            wave.data[i*4+2] = val;
            wave.data[i*4+3] = 255;
        }
        ctx.putImageData(wave, 0, 1);

        this._fftTexture.getContext().drawImage(this._fftCanvas, 0, 0);
        this._fftTexture.update();
    }

    /**
     * Active le mode ShaderToy avec le code donné.
     * Masque le mesh 3D, désactive les post-process habituels.
     */
    enableShaderToy(code) {
        this.shadertoyMode  = true;
        this._stFrame       = 0;
        this._stStartTime   = performance.now();
        this._stLastTime    = performance.now();

        // Masquer le mesh 3D
        if (this.mesh) this.mesh.isVisible = false;

        // Désactiver la pipeline standard (bloom etc.) pour ne pas polluer
        if (this.pipeline) this.pipeline.bloomEnabled = false;

        this.compileShadertoy(code);
        this._showSuccess('🎮 ShaderToy actif !');
    }

    /**
     * Désactive le mode ShaderToy et restaure le rendu 3D.
     */
    disableShaderToy() {
        this.shadertoyMode = false;

        if (this.shadertoyPass) {
            this.shadertoyPass.dispose();
            this.shadertoyPass = null;
        }
        if (this.mesh) this.mesh.isVisible = true;
        if (this.pipeline) this.pipeline.bloomEnabled = true;

        this._showSuccess('🔲 Mode 3D restauré');
    }

    // ── Helpers toast ─────────────────────────────────────────────────────────

    _showError(msg, duration = 5000) {
        const t = document.getElementById('error-toast');
        if (!t) return;
        t.textContent = msg;
        t.style.background = '#ff3b30';
        t.classList.add('visible');
        setTimeout(() => t.classList.remove('visible'), duration);
    }

    _showSuccess(msg, duration = 2000) {
        const t = document.getElementById('error-toast');
        if (!t) return;
        t.textContent = msg;
        t.style.background = '#30d158';
        t.classList.add('visible');
        setTimeout(() => t.classList.remove('visible'), duration);
    }

    dispose(){
        this.engine.stopRenderLoop();
        window.removeEventListener('resize',this.resizeHandler);
        window.removeEventListener('keydown', this.keydownHandler);
        this.canvas.removeEventListener('dragenter', this.dragEnterHandler);
        this.canvas.removeEventListener('dragleave', this.dragLeaveHandler);
        this.canvas.removeEventListener('dragover', this.dragOverHandler);
        this.canvas.removeEventListener('drop',this.dropHandler);
        if (this.shadertoyPass) { this.shadertoyPass.dispose(); this.shadertoyPass = null; }
        if (this._fftTexture)   { this._fftTexture.dispose();  this._fftTexture  = null; }
        if (this.glitchPass)    { this.glitchPass.dispose();   this.glitchPass   = null; }
        this._stopVideoTexture();
        this._disconnectOsc();
        this.audio.dispose();
        this.recorder.stop();
        if(this.pane) this.pane.dispose();
        this.scene.dispose();
        this.engine.dispose();
    }
}
