import { ShaderChunks } from './shaders.js';

const toVec3 = (hex) => {
    const clean = String(hex || '#ffffff').replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    const n = parseInt(full, 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
};

export function buildShadertoyExport(config = {}) {
    const noiseType = config.noiseType || 'simplex';
    const noiseChunk = ShaderChunks[noiseType] || ShaderChunks.simplex;

    const colorA = toVec3(config.uColorA);
    const colorB = toVec3(config.uColorB);
    const colorC = toVec3(config.uColorC);
    const speed = Number(config.uSpeed ?? 0.4).toFixed(3);
    const scale = Number(config.uScale ?? 1.5).toFixed(3);

    return `// Export ShaderToy — généré automatiquement par Shader Studio
// Copiez-collez ce code dans https://www.shadertoy.com/new

${noiseChunk}

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * ${speed};

    vec2 p = uv * ${scale};
    p *= rot(t * 0.25);

    float n1 = getNoise(p + vec2(t, -t * 0.7));
    float n2 = getNoise(p * 1.9 - vec2(t * 0.6, t));
    float n  = mix(n1, n2, 0.45);

    float ring = smoothstep(0.52, 0.18, abs(length(uv) - (0.28 + n * 0.15)));
    float glow = exp(-3.2 * length(uv - vec2(0.0, 0.08 * sin(t * 1.8))));

    vec3 col = mix(${colorA}, ${colorB}, 0.5 + 0.5 * n);
    col = mix(col, ${colorC}, ring * 0.8);
    col += glow * 0.24;

    // iChannel0 (audio FFT) optionnel
    float fft = texture(iChannel0, vec2(0.07, 0.25)).x;
    col *= 1.0 + fft * 0.35;

    fragColor = vec4(pow(max(col, 0.0), vec3(0.95)), 1.0);
}
`;
}
