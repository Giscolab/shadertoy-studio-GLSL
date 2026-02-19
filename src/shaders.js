// =============================================================
//  shaders.js — Shader Studio v5
//  15+ shaders, 22 presets visuels
// =============================================================

export const vertexShaderMain = `
    // Attributes
    attribute vec3 position;
    attribute vec3 normal;
    attribute vec2 uv;

    // Uniforms Babylon
    uniform mat4 worldViewProjection;
    uniform mat4 world;
    uniform mat4 worldView;

    // Uniforms Custom
    uniform float uTime;
    uniform float uSpeed;
    uniform float uScale;
    uniform float uDisplacementStrength;
    uniform float uTwist;
    uniform float uPulse;
    uniform float uMorphFactor;

    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uOverall;
    uniform float uBassDisplace;
    uniform float uMidDisplace;
    uniform float uHighDisplace;

    varying vec2  vUv;
    varying vec2  vMatcapUV;
    varying vec3  vViewNormal;
    varying vec3  vWorldPos;
    varying float vBass;
    varying float vMid;
    varying float vHigh;
    varying float vNoise;

    void main() {
        vUv   = uv;
        vBass = uBass;
        vMid  = uMid;
        vHigh = uHigh;

        // Babylon: worldView contains the ModelView transformation
        vec3 viewNormal = normalize((worldView * vec4(normal, 0.0)).xyz);
        vViewNormal = viewNormal;
        vMatcapUV   = viewNormal.xy * 0.5 + 0.5;

        float dynScale = uScale * (1.0 + uHigh * uHighDisplace * 0.5);
        vec2  st       = vUv * dynScale;
        float dynSpeed = uSpeed * (1.0 + uMid * uMidDisplace);

        float n = getNoise(st + uTime * dynSpeed);
        vNoise  = n;

        float dynDisplace = uDisplacementStrength * (1.0 + uBass * uBassDisplace * 3.0);
        float pulse       = 1.0 + sin(uTime * uPulse) * 0.12;

        // Twist animé
        float angle  = position.y * uTwist + uTime * 0.3;
        float c = cos(angle);
        float s = sin(angle);
        mat2  twMat  = mat2(c, -s, s, c);
        vec3  twisted = position;
        twisted.xz    = twMat * twisted.xz;

        // Morph sphère ↔ géométrie originale
        vec3 spherePos = normalize(position);
        vec3 morphPos  = mix(twisted, spherePos, uMorphFactor * uBass * 0.5);

        vec3 newPos = morphPos + normal * n * dynDisplace * pulse;
        
        vWorldPos   = (world * vec4(newPos, 1.0)).xyz;
        gl_Position = worldViewProjection * vec4(newPos, 1.0);
    }
`;

// =============================================================
//  15 ShaderChunks (noise / générateurs)
// =============================================================
export const ShaderChunks = {

    // 1. Simplex 2D
    simplex: `
        vec3 permute(vec3 x){return mod(((x*34.0)+1.0)*x,289.0);}
        float snoise(vec2 v){
            const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
            vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
            vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
            vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod(i,289.0);
            vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
            vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
            m=m*m;m=m*m;
            vec3 x2=2.*fract(p*C.www)-1.;vec3 h=abs(x2)-0.5;
            vec3 ox=floor(x2+0.5);vec3 a0=x2-ox;
            m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
            vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
            return 130.*dot(m,g);
        }
        float getNoise(vec2 st){return snoise(st);}
    `,

    // 2. Voronoi
    voronoi: `
        vec2 rnd2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
        float getNoise(vec2 st){
            vec2 i=floor(st),f=fract(st);float m=1.;
            for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
                vec2 nb=vec2(float(x),float(y));
                vec2 pt=rnd2(i+nb);pt=0.5+0.5*sin(6.2831*pt);
                m=min(m,length(nb+pt-f));
            }return m;
        }
    `,

    // 3. FBM
    fbm: `
        float _r(vec2 s){return fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);}
        float _n(vec2 s){vec2 i=floor(s),f=fract(s);float a=_r(i),b=_r(i+vec2(1,0)),c=_r(i+vec2(0,1)),d=_r(i+vec2(1,1));vec2 u=f*f*(3.-2.*f);return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}
        float getNoise(vec2 st){float v=0.,a=0.5;mat2 r=mat2(.8,.6,-.6,.8);for(int i=0;i<6;i++){v+=a*_n(st);st=r*st*2.+100.;a*=.5;}return v;}
    `,

    // 4. Plasma
    plasma: `
        float getNoise(vec2 st){
            float v=sin(st.x*3.)+sin(st.y*3.)+sin((st.x+st.y)*3.)+sin(sqrt(st.x*st.x+st.y*st.y)*6.);
            return v*.25;
        }
    `,

    // 5. Galaxy Swirl
    galaxy: `
        float getNoise(vec2 st){
            vec2 c=st-.5;float r=length(c),a=atan(c.y,c.x);
            float swirl=sin(r*8.-a*3.);float arms=sin(a*5.+r*4.)*exp(-r*2.);
            return (swirl*.5+arms)*.5+.5;
        }
    `,

    // 6. Marble
    marble: `
        float _r(vec2 s){return fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);}
        float _n(vec2 s){vec2 i=floor(s),f=fract(s);float a=_r(i),b=_r(i+vec2(1,0)),c=_r(i+vec2(0,1)),d=_r(i+vec2(1,1));vec2 u=f*f*(3.-2.*f);return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}
        float fbmM(vec2 s){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*_n(s);s*=2.01;a*=.5;}return v;}
        float getNoise(vec2 st){float n=fbmM(st);return sin(st.x*4.+n*6.)*.5+.5;}
    `,

    // 7. Acid Wave
    acid: `
        float getNoise(vec2 st){
            float v=sin(st.x*5.+st.y*3.)+sin(st.x*3.-st.y*7.)*.7+sin((st.x+st.y)*4.)*.5+sin(sqrt(st.x*st.x+st.y*st.y)*8.)*.4+sin(st.x*9.)*sin(st.y*7.)*.3;
            return v*.2;
        }
    `,

    // 8. Cellular (distance field)
    cellular: `
        vec2 rnd2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
        float getNoise(vec2 st){
            vec2 i=floor(st),f=fract(st);
            float m1=1.,m2=1.;
            for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
                vec2 nb=vec2(float(x),float(y));
                vec2 pt=rnd2(i+nb);
                float d=length(nb+pt-f);
                if(d<m1){m2=m1;m1=d;}else if(d<m2){m2=d;}
            }
            return m2-m1; // Border effect
        }
    `,

    // 9. Curl / Flow
    curl: `
        float _r(vec2 s){return fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);}
        float _n(vec2 s){vec2 i=floor(s),f=fract(s);float a=_r(i),b=_r(i+vec2(1,0)),c=_r(i+vec2(0,1)),d=_r(i+vec2(1,1));vec2 u=f*f*(3.-2.*f);return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}
        float getNoise(vec2 st){
            float eps=0.01;
            float n=_n(st);
            float nx=_n(st+vec2(eps,0.));float ny=_n(st+vec2(0.,eps));
            vec2 curl=vec2(ny-n,-(nx-n))/eps;
            return _n(st+curl*0.3);
        }
    `,

    // 10. Warped Domain
    warp: `
        float _r(vec2 s){return fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);}
        float _n(vec2 s){vec2 i=floor(s),f=fract(s);float a=_r(i),b=_r(i+vec2(1,0)),c=_r(i+vec2(0,1)),d=_r(i+vec2(1,1));vec2 u=f*f*(3.-2.*f);return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}
        float fbmW(vec2 s){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*_n(s);s*=2.;a*=.5;}return v;}
        float getNoise(vec2 st){
            vec2 q=vec2(fbmW(st),fbmW(st+vec2(1.7,9.2)));
            vec2 r=vec2(fbmW(st+4.*q+vec2(1.7,9.2)),fbmW(st+4.*q+vec2(8.3,2.8)));
            return fbmW(st+4.*r);
        }
    `,

    // 11. Truchet Tiles
    truchet: `
        float _r(vec2 s){return fract(sin(dot(s,vec2(127.1,311.7)))*43758.5453);}
        float getNoise(vec2 st){
            vec2 i=floor(st),f=fract(st);
            float r=step(0.5,_r(i));
            float d1=length(f-vec2(0.,0.));float d2=length(f-vec2(1.,1.));
            float d3=length(f-vec2(1.,0.));float d4=length(f-vec2(0.,1.));
            float arc1=min(abs(d1-.5),abs(d2-.5));
            float arc2=min(abs(d3-.5),abs(d4-.5));
            return mix(arc1,arc2,r)*2.;
        }
    `,

    // 12. Ridged Multifractal
    ridged: `
        float _r(vec2 s){return fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);}
        float _n(vec2 s){vec2 i=floor(s),f=fract(s);float a=_r(i),b=_r(i+vec2(1,0)),c=_r(i+vec2(0,1)),d=_r(i+vec2(1,1));vec2 u=f*f*(3.-2.*f);return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;}
        float getNoise(vec2 st){
            float v=0.,a=.5,freq=1.;
            for(int i=0;i<6;i++){
                float n=1.-abs(_n(st*freq)-.5)*2.;
                v+=a*n*n;freq*=2.;a*=.5;
            }return v;
        }
    `,

    // 13. Mandelbrot-ish
    mandel: `
        float getNoise(vec2 st){
            vec2 c=(st-.5)*2.5;vec2 z=vec2(0.);
            int iter=0;
            for(int i=0;i<32;i++){
                if(dot(z,z)>4.) break;
                z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;
                iter++;
            }
            return float(iter)/32.;
        }
    `,

    // 14. Wave Interference
    wave: `
        float getNoise(vec2 st){
            float v=0.;
            for(int i=0;i<5;i++){
                float fi=float(i);
                vec2 center=vec2(cos(fi*1.2+.5)*.5+.5,sin(fi*.9+1.3)*.5+.5);
                float d=length(st-center);
                v+=sin(d*20.-fi*1.5)/(d*8.+1.);
            }
            return v*.3;
        }
    `,

    // 15. Hexagonal
    hex: `
        vec2 hexRound(vec2 p){
            vec2 q=vec2(p.x*1.1547,p.y+p.x*.5774);
            vec2 qi=floor(q);vec2 qf=fract(q);
            float s=(qf.x+qf.y<1.)?0.:1.;
            return qi+s;
        }
        float _r(vec2 s){return fract(sin(dot(s,vec2(127.1,311.7)))*43758.5453);}
        float getNoise(vec2 st){
            st*=2.;
            vec2 hc=hexRound(st);
            vec2 center=vec2(hc.x*.8660,hc.y-.5*hc.x*.5774);
            float d=length(st-center);
            float border=smoothstep(.4,.45,d);
            return border+_r(hc)*.3;
        }
    `,

    // 16. Reaction Diffusion (Simulated)
    react: `
        float getNoise(vec2 st){
            vec2 p = st * 3.0;
            for(int i=0; i<5; i++){
                p.x += sin(p.y + uTime * 0.5);
                p.y += cos(p.x + uTime * 0.5);
            }
            return sin(length(p)) * 0.5 + 0.5;
        }
    `,
};

// =============================================================
//  Fragment shader principal
// =============================================================
export const fragmentShaderMain = `
    uniform float uTime;
    uniform vec2  uResolution;
    uniform vec3  uColorA;
    uniform vec3  uColorB;
    uniform vec3  uColorC;
    uniform vec3  uColorD;
    uniform float uScale;
    uniform float uSpeed;
    uniform sampler2D uTexture;
    uniform float uTextureMix;
    uniform vec2  uMouse;
    uniform sampler2D uMatcap;
    uniform float uMetalness;
    uniform float uLightIntensity;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uGamma;
    uniform float uRimPower;
    uniform vec3  uRimColor;
    uniform float uFresnelStrength;
    uniform float uGlowRadius;

    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uOverall;
    uniform float uBassDisplace;
    uniform float uMidDisplace;
    uniform float uHighDisplace;

    varying vec2  vUv;
    varying vec2  vMatcapUV;
    varying vec3  vViewNormal;
    varying vec3  vWorldPos;
    varying float vBass;
    varying float vMid;
    varying float vHigh;
    varying float vNoise;

    vec3 sat(vec3 c,float s){float l=dot(c,vec3(.299,.587,.114));return mix(vec3(l),c,s);}
    
    // Fresnel approx (View Space Z is depth)
    float fresnel(vec3 n,float p){ return pow(1.-abs(n.z), p); }

    void main(){
        float dynScale = uScale*(1.+vHigh*uHighDisplace*.3);
        float dynSpeed = uSpeed*(1.+vMid*uMidDisplace);
        vec2  st = vUv*dynScale;
        float audioTime = uTime*dynSpeed + vBass*uBassDisplace*.5;

        float dist=distance(vUv,uMouse);
        float me=smoothstep(.5,0.,dist);

        float n = getNoise(st+audioTime+me*.3);
        float p = getNoise(st+n+audioTime*.2);
        float p2= getNoise(st*1.5-n*.5+audioTime*.1);
        float p3= getNoise(st*2.5+n+audioTime*.05);

        // Gradient 4 couleurs
        vec3 color=mix(uColorA,uColorB,smoothstep(-.5,.2,p));
        color=mix(color,uColorC,smoothstep(.1,.6,p));
        color=mix(color,uColorD,smoothstep(.5,1.,p2));

        // Glow sur mouse
        color+=uColorC*me*uGlowRadius*.8;

        // Audio color modulation
        color+=uColorA*vBass*uBassDisplace*.4;
        color*=(1.+vMid*uMidDisplace*.5);
        float shimmer=getNoise(st*4.+uTime*3.)*vHigh*uHighDisplace;
        color+=vec3(shimmer*.25);

        // Texture
        vec4 tex=texture2D(uTexture,vUv+n*.05);
        color=mix(color,tex.rgb,uTextureMix);

        // Matcap
        vec3 mc=texture2D(uMatcap,vMatcapUV).rgb;
        color=mix(color,mc,uMetalness);

        // Lighting studio 3 points
        vec3 nm=normalize(vViewNormal);
        // Lights adjusted for Babylon View Space (Z is forward/away)
        float key  =max(dot(nm,normalize(vec3(1.,1.2,-2.))),0.);
        float fill =max(dot(nm,normalize(vec3(-1.,0.,-1.5))),0.)*.35;
        float back =max(dot(nm,normalize(vec3(0.,-1.,1.))),0.)*.15;
        
        float dynL =uLightIntensity*(1.+vBass*uBassDisplace*.6);
        vec3 lighting=vec3(.15)+(vec3(1.)*key+vec3(.7)*fill+vec3(.4)*back)*dynL;
        color*=lighting;

        // Rim + Fresnel
        float rim=fresnel(nm,uRimPower);
        color+=uRimColor*rim*(1.+vHigh*.5);
        color+=uRimColor*fresnel(nm,uFresnelStrength)*.3;

        // Grading
        color=(color-.5)*uContrast+.5;
        color=sat(color,uSaturation);
        color=pow(max(color,0.),vec3(1./uGamma));

        gl_FragColor=vec4(color,1.);
    }
`;

// =============================================================
//  22 Presets visuels
// =============================================================
export const PRESETS = {
    'Cyberpunk Neon': {
        noiseType:'simplex',geometryType:'sphere',
        uColorA:{r:5,g:0,b:20},uColorB:{r:180,g:0,b:255},uColorC:{r:0,g:255,b:200},uColorD:{r:255,g:50,b:100},
        uScale:2.5,uSpeed:0.8,uDisplacementStrength:0.4,uTwist:0.5,uPulse:3.0,uMorphFactor:0.2,
        uMetalness:0.3,uLightIntensity:1.4,uContrast:1.3,uSaturation:1.8,uGamma:1.2,
        uRimPower:3.0,uRimColor:{r:0,g:255,b:200},uFresnelStrength:4.0,uGlowRadius:1.0,
        cyberpunkMode:true,bloomStrength:2.0,bloomRadius:0.5,bloomThreshold:0.1,
    },
    'Lava Planet': {
        noiseType:'fbm',geometryType:'icosahedron',
        uColorA:{r:5,g:0,b:0},uColorB:{r:180,g:20,b:0},uColorC:{r:255,g:100,b:0},uColorD:{r:255,g:220,b:50},
        uScale:3.0,uSpeed:0.3,uDisplacementStrength:0.7,uTwist:0.0,uPulse:1.5,uMorphFactor:0.0,
        uMetalness:0.0,uLightIntensity:1.8,uContrast:1.5,uSaturation:1.6,uGamma:1.0,
        uRimPower:2.0,uRimColor:{r:255,g:80,b:0},uFresnelStrength:3.0,uGlowRadius:0.5,
        bloomStrength:1.5,bloomRadius:0.4,bloomThreshold:0.2,
    },
    'Deep Ocean': {
        noiseType:'voronoi',geometryType:'sphere',
        uColorA:{r:0,g:5,b:30},uColorB:{r:0,g:40,b:100},uColorC:{r:0,g:150,b:180},uColorD:{r:150,g:230,b:255},
        uScale:2.0,uSpeed:0.4,uDisplacementStrength:0.3,uTwist:0.2,uPulse:2.0,uMorphFactor:0.1,
        uMetalness:0.5,uLightIntensity:1.2,uContrast:1.1,uSaturation:1.4,uGamma:1.1,
        uRimPower:4.0,uRimColor:{r:100,g:200,b:255},uFresnelStrength:5.0,uGlowRadius:0.8,
        bloomStrength:1.2,bloomRadius:0.4,bloomThreshold:0.3,
    },
    'Galaxy Swirl': {
        noiseType:'galaxy',geometryType:'plane',
        uColorA:{r:2,g:0,b:10},uColorB:{r:80,g:0,b:120},uColorC:{r:200,g:150,b:255},uColorD:{r:255,g:240,b:200},
        uScale:1.5,uSpeed:0.2,uDisplacementStrength:0.15,uTwist:0.0,uPulse:1.0,uMorphFactor:0.0,
        uMetalness:0.1,uLightIntensity:0.8,uContrast:1.2,uSaturation:1.5,uGamma:1.3,
        uRimPower:5.0,uRimColor:{r:200,g:150,b:255},uFresnelStrength:6.0,uGlowRadius:1.2,
        bloomStrength:2.5,bloomRadius:0.7,bloomThreshold:0.05,
    },
    'Acid Trip': {
        noiseType:'acid',geometryType:'torusknot',
        uColorA:{r:0,g:255,b:50},uColorB:{r:255,g:0,b:150},uColorC:{r:255,g:255,b:0},uColorD:{r:0,g:150,b:255},
        uScale:2.0,uSpeed:1.2,uDisplacementStrength:0.5,uTwist:2.0,uPulse:5.0,uMorphFactor:0.3,
        uMetalness:0.0,uLightIntensity:1.0,uContrast:1.4,uSaturation:2.0,uGamma:0.9,
        uRimPower:2.5,uRimColor:{r:255,g:100,b:0},uFresnelStrength:3.0,uGlowRadius:0.6,
        cyberpunkMode:true,bloomStrength:2.0,bloomRadius:0.5,bloomThreshold:0.1,
    },
    'White Marble': {
        noiseType:'marble',geometryType:'sphere',
        uColorA:{r:220,g:218,b:215},uColorB:{r:180,g:175,b:170},uColorC:{r:100,g:95,b:90},uColorD:{r:30,g:28,b:25},
        uScale:3.0,uSpeed:0.05,uDisplacementStrength:0.1,uTwist:0.0,uPulse:0.5,uMorphFactor:0.0,
        uMetalness:0.7,uLightIntensity:1.8,uContrast:1.1,uSaturation:0.5,uGamma:1.2,
        uRimPower:6.0,uRimColor:{r:255,g:255,b:255},uFresnelStrength:8.0,uGlowRadius:0.3,
        bloomStrength:0.8,bloomRadius:0.3,bloomThreshold:0.5,
    },
    'Plasma Storm': {
        noiseType:'plasma',geometryType:'torusknot',
        uColorA:{r:0,g:0,b:50},uColorB:{r:100,g:0,b:200},uColorC:{r:0,g:200,b:255},uColorD:{r:255,g:255,b:255},
        uScale:2.0,uSpeed:1.5,uDisplacementStrength:0.6,uTwist:1.5,uPulse:4.0,uMorphFactor:0.2,
        uMetalness:0.2,uLightIntensity:1.2,uContrast:1.5,uSaturation:1.8,uGamma:1.0,
        uRimPower:3.0,uRimColor:{r:100,g:200,b:255},uFresnelStrength:4.0,uGlowRadius:1.5,
        bloomStrength:2.5,bloomRadius:0.6,bloomThreshold:0.08,
    },
    'Cellular Life': {
        noiseType:'cellular',geometryType:'sphere',
        uColorA:{r:0,g:20,b:0},uColorB:{r:0,g:100,b:30},uColorC:{r:50,g:200,b:50},uColorD:{r:200,g:255,b:150},
        uScale:4.0,uSpeed:0.3,uDisplacementStrength:0.25,uTwist:0.3,uPulse:2.0,uMorphFactor:0.1,
        uMetalness:0.1,uLightIntensity:1.3,uContrast:1.2,uSaturation:1.6,uGamma:1.1,
        uRimPower:4.0,uRimColor:{r:100,g:255,b:100},uFresnelStrength:5.0,uGlowRadius:0.5,
        bloomStrength:1.5,bloomRadius:0.4,bloomThreshold:0.3,
    },
    'Fluid Flow': {
        noiseType:'curl',geometryType:'plane',
        uColorA:{r:0,g:10,b:40},uColorB:{r:20,g:60,b:150},uColorC:{r:100,g:180,b:255},uColorD:{r:230,g:240,b:255},
        uScale:2.5,uSpeed:0.6,uDisplacementStrength:0.2,uTwist:0.0,uPulse:1.5,uMorphFactor:0.0,
        uMetalness:0.4,uLightIntensity:1.0,uContrast:1.0,uSaturation:1.2,uGamma:1.15,
        uRimPower:5.0,uRimColor:{r:150,g:220,b:255},uFresnelStrength:6.0,uGlowRadius:0.4,
        bloomStrength:1.0,bloomRadius:0.5,bloomThreshold:0.4,
    },
    'Domain Warp': {
        noiseType:'warp',geometryType:'dodecahedron',
        uColorA:{r:10,g:0,b:30},uColorB:{r:80,g:20,b:100},uColorC:{r:200,g:100,b:220},uColorD:{r:255,g:200,b:255},
        uScale:1.8,uSpeed:0.4,uDisplacementStrength:0.5,uTwist:1.0,uPulse:2.5,uMorphFactor:0.2,
        uMetalness:0.3,uLightIntensity:1.2,uContrast:1.3,uSaturation:1.7,uGamma:1.1,
        uRimPower:3.5,uRimColor:{r:200,g:100,b:255},uFresnelStrength:4.0,uGlowRadius:0.8,
        bloomStrength:1.8,bloomRadius:0.5,bloomThreshold:0.15,
    },
    'Circuit Board': {
        noiseType:'truchet',geometryType:'plane',
        uColorA:{r:0,g:15,b:5},uColorB:{r:0,g:60,b:20},uColorC:{r:0,g:200,b:80},uColorD:{r:150,g:255,b:150},
        uScale:5.0,uSpeed:0.1,uDisplacementStrength:0.05,uTwist:0.0,uPulse:0.5,uMorphFactor:0.0,
        uMetalness:0.2,uLightIntensity:1.5,uContrast:1.8,uSaturation:1.5,uGamma:0.9,
        uRimPower:6.0,uRimColor:{r:0,g:255,b:100},uFresnelStrength:8.0,uGlowRadius:0.3,
        bloomStrength:2.0,bloomRadius:0.3,bloomThreshold:0.2,
    },
    'Mountain Ridge': {
        noiseType:'ridged',geometryType:'plane',
        uColorA:{r:10,g:8,b:6},uColorB:{r:60,g:45,b:30},uColorC:{r:180,g:160,b:140},uColorD:{r:255,g:250,b:245},
        uScale:3.0,uSpeed:0.05,uDisplacementStrength:0.8,uTwist:0.0,uPulse:0.3,uMorphFactor:0.0,
        uMetalness:0.0,uLightIntensity:2.0,uContrast:1.4,uSaturation:0.7,uGamma:1.1,
        uRimPower:8.0,uRimColor:{r:255,g:250,b:240},uFresnelStrength:10.0,uGlowRadius:0.0,
        bloomStrength:0.5,bloomRadius:0.3,bloomThreshold:0.6,
    },
    'Fractal Eye': {
        noiseType:'mandel',geometryType:'plane',
        uColorA:{r:0,g:0,b:5},uColorB:{r:0,g:30,b:80},uColorC:{r:255,g:120,b:0},uColorD:{r:255,g:255,b:200},
        uScale:1.0,uSpeed:0.02,uDisplacementStrength:0.0,uTwist:0.0,uPulse:0.0,uMorphFactor:0.0,
        uMetalness:0.0,uLightIntensity:0.5,uContrast:2.0,uSaturation:2.0,uGamma:0.8,
        uRimPower:10.0,uRimColor:{r:255,g:200,b:0},uFresnelStrength:12.0,uGlowRadius:0.0,
        bloomStrength:1.0,bloomRadius:0.3,bloomThreshold:0.4,
    },
    'Wave Pool': {
        noiseType:'wave',geometryType:'plane',
        uColorA:{r:0,g:5,b:20},uColorB:{r:0,g:100,b:200},uColorC:{r:0,g:200,b:255},uColorD:{r:200,g:240,b:255},
        uScale:1.5,uSpeed:0.8,uDisplacementStrength:0.4,uTwist:0.0,uPulse:3.0,uMorphFactor:0.0,
        uMetalness:0.6,uLightIntensity:1.3,uContrast:1.1,uSaturation:1.3,uGamma:1.1,
        uRimPower:4.0,uRimColor:{r:100,g:220,b:255},uFresnelStrength:6.0,uGlowRadius:0.6,
        bloomStrength:1.5,bloomRadius:0.5,bloomThreshold:0.25,
    },
    'Hex Grid': {
        noiseType:'hex',geometryType:'plane',
        uColorA:{r:5,g:5,b:15},uColorB:{r:20,g:20,b:60},uColorC:{r:80,g:80,b:200},uColorD:{r:180,g:180,b:255},
        uScale:6.0,uSpeed:0.2,uDisplacementStrength:0.1,uTwist:0.0,uPulse:1.0,uMorphFactor:0.0,
        uMetalness:0.5,uLightIntensity:1.4,uContrast:1.5,uSaturation:1.2,uGamma:0.95,
        uRimPower:5.0,uRimColor:{r:150,g:150,b:255},uFresnelStrength:7.0,uGlowRadius:0.4,
        cyberpunkMode:true,bloomStrength:1.5,bloomRadius:0.3,bloomThreshold:0.3,
    },
    'Solar Flare': {
        noiseType:'ridged',geometryType:'sphere',
        uColorA:{r:20,g:0,b:0},uColorB:{r:255,g:60,b:0},uColorC:{r:255,g:200,b:0},uColorD:{r:255,g:255,b:200},
        uScale:4.0,uSpeed:0.6,uDisplacementStrength:0.6,uTwist:0.5,uPulse:4.0,uMorphFactor:0.3,
        uMetalness:0.0,uLightIntensity:2.0,uContrast:1.6,uSaturation:2.0,uGamma:0.85,
        uRimPower:2.0,uRimColor:{r:255,g:150,b:0},uFresnelStrength:3.0,uGlowRadius:1.5,
        bloomStrength:3.0,bloomRadius:0.6,bloomThreshold:0.05,
    },
    'Toxic Swamp': {
        noiseType:'warp',geometryType:'plane',
        uColorA:{r:5,g:15,b:0},uColorB:{r:20,g:60,b:5},uColorC:{r:80,g:180,b:0},uColorD:{r:200,g:255,b:50},
        uScale:2.5,uSpeed:0.3,uDisplacementStrength:0.3,uTwist:0.0,uPulse:1.0,uMorphFactor:0.0,
        uMetalness:0.0,uLightIntensity:0.9,uContrast:1.3,uSaturation:2.0,uGamma:1.05,
        uRimPower:4.0,uRimColor:{r:150,g:255,b:0},uFresnelStrength:5.0,uGlowRadius:0.7,
        bloomStrength:1.5,bloomRadius:0.4,bloomThreshold:0.2,
    },
    'Crystal Cave': {
        noiseType:'cellular',geometryType:'dodecahedron',
        uColorA:{r:5,g:0,b:20},uColorB:{r:30,g:0,b:80},uColorC:{r:100,g:50,b:200},uColorD:{r:200,g:180,b:255},
        uScale:3.0,uSpeed:0.15,uDisplacementStrength:0.35,uTwist:0.8,uPulse:1.5,uMorphFactor:0.15,
        uMetalness:0.8,uLightIntensity:1.5,uContrast:1.2,uSaturation:1.5,uGamma:1.15,
        uRimPower:3.0,uRimColor:{r:200,g:180,b:255},uFresnelStrength:4.0,uGlowRadius:0.9,
        bloomStrength:2.0,bloomRadius:0.5,bloomThreshold:0.15,
    },
    'Neon Desert': {
        noiseType:'simplex',geometryType:'plane',
        uColorA:{r:20,g:5,b:0},uColorB:{r:120,g:40,b:0},uColorC:{r:255,g:120,b:0},uColorD:{r:255,g:220,b:100},
        uScale:3.5,uSpeed:0.25,uDisplacementStrength:0.5,uTwist:0.0,uPulse:1.0,uMorphFactor:0.0,
        uMetalness:0.0,uLightIntensity:1.5,uContrast:1.4,uSaturation:1.8,uGamma:1.0,
        uRimPower:3.0,uRimColor:{r:255,g:100,b:0},uFresnelStrength:4.0,uGlowRadius:0.5,
        bloomStrength:1.2,bloomRadius:0.4,bloomThreshold:0.3,
    },
    'Ice Cavern': {
        noiseType:'curl',geometryType:'icosahedron',
        uColorA:{r:0,g:10,b:30},uColorB:{r:10,g:80,b:150},uColorC:{r:150,g:220,b:255},uColorD:{r:230,g:245,b:255},
        uScale:2.0,uSpeed:0.2,uDisplacementStrength:0.2,uTwist:0.3,uPulse:1.0,uMorphFactor:0.0,
        uMetalness:0.9,uLightIntensity:1.6,uContrast:0.95,uSaturation:0.9,uGamma:1.2,
        uRimPower:5.0,uRimColor:{r:200,g:235,b:255},uFresnelStrength:8.0,uGlowRadius:0.3,
        bloomStrength:1.0,bloomRadius:0.6,bloomThreshold:0.4,
    },
    'Glitch Matrix': {
        noiseType:'truchet',geometryType:'plane',
        uColorA:{r:0,g:0,b:0},uColorB:{r:0,g:50,b:0},uColorC:{r:0,g:200,b:0},uColorD:{r:150,g:255,b:150},
        uScale:8.0,uSpeed:0.5,uDisplacementStrength:0.02,uTwist:0.0,uPulse:0.5,uMorphFactor:0.0,
        uMetalness:0.0,uLightIntensity:0.8,uContrast:2.0,uSaturation:1.5,uGamma:0.8,
        uRimPower:8.0,uRimColor:{r:0,g:255,b:80},uFresnelStrength:10.0,uGlowRadius:0.2,
        glitchMode:true,bloomStrength:2.5,bloomRadius:0.3,bloomThreshold:0.1,
    },
    'Golden Hour': {
        noiseType:'fbm',geometryType:'sphere',
        uColorA:{r:15,g:5,b:0},uColorB:{r:100,g:40,b:5},uColorC:{r:220,g:140,b:30},uColorD:{r:255,g:240,b:180},
        uScale:2.5,uSpeed:0.1,uDisplacementStrength:0.2,uTwist:0.2,uPulse:0.8,uMorphFactor:0.05,
        uMetalness:0.5,uLightIntensity:2.2,uContrast:1.2,uSaturation:1.4,uGamma:1.15,
        uRimPower:4.0,uRimColor:{r:255,g:200,b:80},uFresnelStrength:6.0,uGlowRadius:0.6,
        bloomStrength:1.5,bloomRadius:0.5,bloomThreshold:0.3,
    },
};

// =============================================================
//  ShaderToy templates de démarrage
// =============================================================
export const SHADERTOY_TEMPLATES = {
    'Hello World': `// ShaderToy Hello World
// Compatible 100% shadertoy.com — collez n'importe quel shader ici !
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0.0, 2.0, 4.0));
    fragColor = vec4(col, 1.0);
}`,

    'Audio Visualizer': `// Visualiseur audio ShaderToy
// iChannel0 = FFT (row 0) + waveform (row 1)
// + uniforms bonus: uBass, uMid, uHigh, uOverall
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float fft  = texture2D(iChannel0, vec2(uv.x, 0.25)).r;
    float wave = texture2D(iChannel0, vec2(uv.x, 0.75)).r * 2.0 - 1.0;

    // Spectre fréquentiel (barres vertes)
    vec3 col = vec3(0.0);
    col += vec3(0.0, 1.0, 0.3) * step(uv.y, fft);

    // Waveform (ligne blanche)
    col += vec3(1.0) * (1.0 - smoothstep(0.0, 0.01, abs(uv.y - (0.5 + wave * 0.4))));

    // Glow bass
    col += vec3(1.0, 0.3, 0.0) * uBass * 0.3 * (1.0 - uv.y);

    fragColor = vec4(col, 1.0);
}`,

    'Raymarching Sphère': `// Raymarching basique — sphère SDF
float sdSphere(vec3 p, float r) { return length(p) - r; }
float map(vec3 p) {
    p.y += sin(iTime + p.x * 2.0) * 0.2 * (1.0 + uBass * 2.0);
    return sdSphere(p, 0.8 + uBass * 0.3);
}
vec3 normal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx)));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    vec3 ro = vec3(0.0, 0.0, 2.5);
    vec3 rd = normalize(vec3(uv, -1.5));
    float t = 0.0;
    for (int i = 0; i < 80; i++) {
        float d = map(ro + rd * t);
        if (d < 0.001 || t > 10.0) break;
        t += d;
    }
    vec3 col = vec3(0.05);
    if (t < 10.0) {
        vec3 p = ro + rd * t;
        vec3 n = normal(p);
        vec3 light = normalize(vec3(1.5, 2.0, 2.0));
        float diff = max(dot(n, light), 0.0);
        float spec = pow(max(dot(reflect(-light, n), -rd), 0.0), 32.0);
        vec3 baseCol = 0.5 + 0.5 * cos(iTime * 0.5 + n.xyz * 3.14159 + vec3(0.0,2.0,4.0));
        col = baseCol * diff + vec3(1.0) * spec * 0.4 + uHigh * vec3(0.5,0.8,1.0) * 0.3;
    }
    fragColor = vec4(col, 1.0);
}`,

    'Fractale Julia': `// Fractale Julia réactive à l'audio
vec2 cMul(vec2 a, vec2 b) { return vec2(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / min(iResolution.x, iResolution.y) * 2.5;
    vec2 c = vec2(-0.7269 + uBass * 0.1, 0.1889 + uMid * 0.05);
    c += 0.01 * vec2(cos(iTime * 0.3), sin(iTime * 0.2));
    vec2 z = uv;
    float iter = 0.0;
    for (int i = 0; i < 128; i++) {
        if (dot(z, z) > 4.0) break;
        z = cMul(z, z) + c;
        iter += 1.0;
    }
    float t = iter / 128.0;
    vec3 col = 0.5 + 0.5 * cos(iTime * 0.2 + t * 6.28318 * 3.0 + vec3(0.0, 0.6, 1.0));
    col *= 1.0 + uOverall * 0.5;
    fragColor = vec4(col, 1.0);
}`,

    'Tunnels 3D': `// Tunnel infini — classique ShaderToy
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    float a = atan(uv.y, uv.x) / 6.28318;
    float r = length(uv);
    float t = iTime * (0.5 + uBass * 0.8);
    vec2 st = vec2(a + 0.5, 0.3 / (r + 0.1) + t);
    float grid = abs(fract(st.x * 8.0) - 0.5) * 2.0;
    grid = min(grid, abs(fract(st.y * 4.0) - 0.5) * 2.0);
    grid = smoothstep(0.9, 1.0, grid);
    vec3 col = mix(vec3(0.02, 0.05, 0.2), vec3(0.0, 0.8 + uMid, 1.0), grid);
    col += vec3(1.0, 0.4, 0.0) * (1.0 - r) * uBass * 0.5;
    col *= 1.0 - r * 0.8;
    fragColor = vec4(col, 1.0);
}`,

    // ── 15 nouveaux templates ─────────────────────────────────────────────────

    'Metaballs': `// Metaballs organiques — audio reactive
float metaball(vec2 p, vec2 c, float r) {
    return r / dot(p - c, p - c);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    float t = iTime;
    float sum = 0.0;
    float s = 1.0 + uBass * 0.5;
    sum += metaball(uv, vec2(sin(t * 0.9) * 0.4, cos(t * 0.7) * 0.3) * s, 0.04 + uBass * 0.02);
    sum += metaball(uv, vec2(cos(t * 1.1) * 0.35, sin(t * 0.8) * 0.35) * s, 0.035 + uMid * 0.02);
    sum += metaball(uv, vec2(sin(t * 0.6 + 1.0) * 0.3, cos(t * 1.3) * 0.4) * s, 0.03 + uHigh * 0.02);
    sum += metaball(uv, vec2(cos(t * 0.5) * 0.45, sin(t * 1.1 + 2.0) * 0.25) * s, 0.025);
    sum += metaball(uv, vec2(sin(t * 1.4) * 0.2, cos(t * 0.6 + 1.5) * 0.45) * s, 0.03);
    float edge = smoothstep(0.9, 1.1, sum);
    vec3 col = mix(vec3(0.02, 0.0, 0.05), vec3(0.1, 0.8, 1.0) + vec3(uBass, uMid, uHigh) * 0.5, edge);
    col += vec3(0.4, 0.1, 0.8) * smoothstep(1.1, 1.5, sum) * 0.6;
    col += vec3(1.0) * smoothstep(1.8, 2.5, sum) * (0.3 + uOverall * 0.4);
    fragColor = vec4(col, 1.0);
}`,

    'Voronoi Neon': `// Voronoi néon avec glow audio
vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy * 6.0;
    uv.x *= iResolution.x / iResolution.y;
    vec2 p = floor(uv), f = fract(uv);
    float minDist = 1e9, minDist2 = 1e9;
    vec2 minPoint = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 nb = vec2(float(x), float(y));
        vec2 pt = hash2(p + nb);
        pt = 0.5 + 0.5 * sin(iTime * 0.5 + 6.28318 * pt);
        float d = length(nb + pt - f);
        if (d < minDist) { minDist2 = minDist; minDist = d; minPoint = p + nb + pt; }
        else if (d < minDist2) minDist2 = d;
    }
    float edge = minDist2 - minDist;
    float glow = exp(-edge * (8.0 + uBass * 12.0));
    vec3 hue = 0.5 + 0.5 * cos(vec3(0.0, 0.4, 0.8) * 6.28318 + length(minPoint) * 1.5 + iTime * 0.3);
    vec3 col = hue * glow * (1.5 + uOverall);
    col += vec3(0.05, 0.02, 0.1) * (1.0 - glow);
    fragColor = vec4(col, 1.0);
}`,

    'Plasma Acide': `// Plasma multi-couches acide
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime * (0.8 + uBass * 0.5);
    float s = 1.0 + uMid * 0.3;
    float v = sin(uv.x * 10.0 * s + t) * 0.5 + 0.5;
    v += sin(uv.y * 8.0 * s + t * 1.1) * 0.5 + 0.5;
    v += sin((uv.x + uv.y) * 7.0 * s + t * 0.9) * 0.5 + 0.5;
    v += sin(sqrt((uv.x - 0.5) * (uv.x - 0.5) + (uv.y - 0.5) * (uv.y - 0.5)) * 20.0 - t * 1.3) * 0.5 + 0.5;
    v += sin(uv.x * 5.0 + sin(t + uv.y * 6.0) * 3.0) * 0.5 + 0.5;
    v /= 5.0;
    vec3 col = vec3(
        sin(v * 6.28318 * 2.0 + iTime * 0.2) * 0.5 + 0.5,
        sin(v * 6.28318 * 2.0 + iTime * 0.2 + 2.094) * 0.5 + 0.5,
        sin(v * 6.28318 * 2.0 + iTime * 0.2 + 4.189) * 0.5 + 0.5
    );
    col = pow(col, vec3(0.8 + uHigh * 0.4));
    fragColor = vec4(col, 1.0);
}`,

    'SDF Tore': `// Tore SDF raymarché avec éclairage
float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}
float map(vec3 p) {
    p.xz *= mat2(cos(iTime*0.3), -sin(iTime*0.3), sin(iTime*0.3), cos(iTime*0.3));
    p.xy *= mat2(cos(iTime*0.2), -sin(iTime*0.2), sin(iTime*0.2), cos(iTime*0.2));
    return sdTorus(p, vec2(0.6 + uBass * 0.2, 0.2 + uMid * 0.1));
}
vec3 normal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx)));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    vec3 ro = vec3(0.0, 0.0, 2.0), rd = normalize(vec3(uv, -1.2));
    float t = 0.0;
    for (int i = 0; i < 100; i++) {
        float d = map(ro + rd * t);
        if (d < 0.001 || t > 8.0) break;
        t += d;
    }
    vec3 col = vec3(0.02, 0.02, 0.05);
    if (t < 8.0) {
        vec3 p = ro + rd * t, n = normal(p);
        vec3 l1 = normalize(vec3(1.0, 1.5, 1.0)), l2 = normalize(vec3(-1.0, 0.5, 0.5));
        float d1 = max(dot(n, l1), 0.0), d2 = max(dot(n, l2), 0.0) * 0.4;
        float spec = pow(max(dot(reflect(-l1, n), -rd), 0.0), 48.0);
        vec3 base = 0.5 + 0.5 * cos(iTime * 0.4 + vec3(0.0, 2.1, 4.2) + length(p) * 2.0);
        col = base * (d1 + d2) + vec3(1.0) * spec * (0.6 + uHigh * 0.4);
        col += base * 0.08;
    }
    fragColor = vec4(col, 1.0);
}`,

    'Mandelbulb 2D': `// Mandelbulb power-8 slice — fractal 2D
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / min(iResolution.x, iResolution.y);
    float zoom = 1.8 - uBass * 0.3;
    uv *= zoom;
    uv += vec2(-0.5, 0.0);
    vec3 pos = vec3(uv, 0.0);
    vec3 z = pos;
    float dr = 1.0, r = 0.0;
    int iter = 0;
    for (int i = 0; i < 64; i++) {
        r = length(z);
        if (r > 2.0) break;
        float theta = atan(z.y, z.x) * 8.0;
        float phi   = asin(z.z / r) * 8.0;
        float zr    = pow(r, 8.0);
        dr = pow(r, 7.0) * 8.0 * dr + 1.0;
        z  = zr * vec3(cos(phi)*cos(theta), cos(phi)*sin(theta), sin(phi)) + pos;
        iter++;
    }
    float trap = float(iter) / 64.0;
    float glow = 1.0 - smoothstep(0.0, 0.02, log(r) * r / dr);
    vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 0.5, 1.0) * 6.28 + trap * 8.0 + iTime * 0.1);
    col *= trap * 1.5 + glow * (0.5 + uOverall * 0.5);
    fragColor = vec4(col, 1.0);
}`,

    'Neon Grid': `// Grille néon infinie en perspective
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    // Perspective vers le bas
    float fov = 0.6;
    vec3 rd = normalize(vec3(uv.x, uv.y + 0.3, fov));
    vec3 ro = vec3(iTime * (1.0 + uBass * 0.5), 0.5, iTime * 2.0);
    // Intersection plan y=0
    float t = -ro.y / rd.y;
    vec3 col = vec3(0.02, 0.0, 0.08);
    if (t > 0.0 && rd.y < 0.0) {
        vec3 hit = ro + rd * t;
        vec2 grid = abs(fract(hit.xz * 0.5) - 0.5);
        float line = min(grid.x, grid.y);
        float glow = exp(-line * (20.0 + uMid * 15.0));
        vec3 lineCol = mix(vec3(0.0, 0.5, 1.0), vec3(1.0, 0.0, 0.8), fract(hit.x * 0.1 + iTime * 0.05));
        lineCol += vec3(uBass, 0.0, uHigh) * 0.5;
        col += lineCol * glow * (1.5 / (1.0 + t * 0.1));
        // Horizon glow
        col += vec3(0.0, 0.3, 1.0) * exp(-t * 0.15) * 0.3;
    }
    // Sky gradient
    col += vec3(0.02, 0.0, 0.12) * max(0.0, uv.y + 0.3);
    fragColor = vec4(col, 1.0);
}`,

    'Warp de Domaine': `// Domain warping — paysage organique
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.1 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime * 0.15;
    vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(1.7, 9.2) + t));
    vec2 r = vec2(fbm(uv + 3.0 * q + vec2(1.7, 9.2) + t * 0.8),
                  fbm(uv + 3.0 * q + vec2(8.3, 2.8) + t * 0.8));
    float f = fbm(uv + 3.5 * r * (1.0 + uBass * 0.5));
    vec3 col = mix(vec3(0.05, 0.02, 0.1), vec3(0.2, 0.05, 0.4), clamp(f * 2.0, 0.0, 1.0));
    col = mix(col, vec3(0.0, 0.5, 0.8), clamp(f * f * 3.0 + uMid * 0.3, 0.0, 1.0));
    col = mix(col, vec3(0.8, 0.9, 1.0), clamp(pow(f, 4.0) * 6.0 + uHigh * 0.2, 0.0, 1.0));
    fragColor = vec4(col, 1.0);
}`,

    'Particules Orbitales': `// Particules en orbite — audio reactive
#define N 64
float circle(vec2 uv, vec2 c, float r) {
    return smoothstep(r, r * 0.8, length(uv - c));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    vec3 col = vec3(0.0);
    float t = iTime;
    for (int i = 0; i < N; i++) {
        float fi = float(i);
        float seed = fi / float(N) * 6.28318;
        float orbit = 0.1 + mod(fi * 0.137, 0.4);
        orbit *= 1.0 + uBass * 0.3;
        float speed = 0.3 + mod(fi * 0.271, 0.7);
        float angle = seed + t * speed * (mod(fi, 2.0) == 0.0 ? 1.0 : -1.0);
        vec2 pos = vec2(cos(angle), sin(angle)) * orbit;
        pos.x += sin(t * 0.3 + seed) * 0.05 * uMid;
        float r = 0.004 + mod(fi * 0.093, 0.008) + uHigh * 0.003;
        float bright = circle(uv, pos, r);
        vec3 hue = 0.5 + 0.5 * cos(vec3(0.0, 0.4, 0.8) * 6.28318 + seed * 3.0 + t * 0.1);
        col += hue * bright * (1.0 + uOverall * 0.5);
        // Glow
        col += hue * 0.015 / (length(uv - pos) + 0.01) * 0.003 * (1.0 + uBass);
    }
    fragColor = vec4(col, 1.0);
}`,

    'Kaleidoscope': `// Kaléidoscope géométrique
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    float t = iTime * 0.2;
    // Symétrie polaire
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    float n = 6.0 + floor(uBass * 4.0); // 6 à 10 segments selon la basse
    a = mod(a, 6.28318 / n);
    a = abs(a - 3.14159 / n);
    uv = r * vec2(cos(a), sin(a));
    // Motif
    uv += vec2(sin(t + r * 3.0), cos(t * 1.1 + r * 2.5)) * (0.1 + uMid * 0.15);
    float v = sin(uv.x * 8.0 + t * 2.0) * sin(uv.y * 8.0 + t * 1.7);
    v += sin(length(uv) * 12.0 - t * 3.0) * 0.5;
    v = v * 0.5 + 0.5;
    vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 0.4, 0.8) * 6.28318 + v * 4.0 + t + r * 2.0);
    col *= 1.0 + uOverall * 0.6;
    col *= 1.0 - smoothstep(0.4, 0.5, r); // vignette
    fragColor = vec4(col, 1.0);
}`,

    'Feu Stylisé': `// Feu procédural — audio reactive
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a*noise(p); p*=2.1; a*=0.5; }
    return v;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv.x = uv.x * 2.0 - 1.0;
    float t = iTime * (1.5 + uBass * 1.0);
    vec2 q = uv + vec2(0.0, t * 0.4);
    float f = fbm(q * vec2(1.5, 2.5));
    f += fbm(q * 3.0 + vec2(f, t * 0.3)) * 0.5;
    f = f * (1.0 - uv.y) * (1.0 - abs(uv.x) * 0.8);
    f = pow(max(f, 0.0), 1.2 + uMid * 0.5);
    vec3 fire = vec3(f * 2.5, f * f * 1.2, f * f * f * 0.3);
    fire += vec3(0.3, 0.05, 0.0) * smoothstep(0.0, 0.3, f) * uHigh;
    fragColor = vec4(fire, 1.0);
}`,

    'Ribbons Géométriques': `// Rubans géométriques en rotation
#define PI 3.14159265
float ribbon(vec2 uv, float angle, float w, float t) {
    float c = cos(angle), s = sin(angle);
    vec2 r = vec2(c*uv.x - s*uv.y, s*uv.x + c*uv.y);
    float wave = sin(r.x * 6.0 + t) * 0.05;
    return smoothstep(w, w * 0.3, abs(r.y + wave));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    uv *= 1.5;
    float t = iTime * (0.4 + uBass * 0.3);
    vec3 col = vec3(0.02, 0.02, 0.05);
    int N = 8;
    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float angle = fi * PI / float(N) + t * 0.15 * (mod(fi, 2.0) == 0.0 ? 1.0 : -1.0);
        float w = 0.015 + uMid * 0.01;
        float r = ribbon(uv, angle, w, t + fi * 0.7);
        vec3 hue = 0.5 + 0.5 * cos(vec3(0.0, 0.4, 0.8) * 6.28 + fi * 0.8 + t * 0.2);
        col += hue * r * (1.0 + uHigh * 0.5);
        // Glow
        float dist = abs(cos(angle)*uv.y - sin(angle)*uv.x);
        col += hue * 0.004 / (dist + 0.01) * (0.5 + uBass * 0.5);
    }
    fragColor = vec4(col, 1.0);
}`,

    'Nuage de Points': `// Point cloud 3D projeté
#define N 200
float hash(float n) { return fract(sin(n) * 43758.5453); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    vec3 col = vec3(0.0);
    float t = iTime * 0.3;
    float rx = t * 0.4, ry = t * 0.6;
    float cx = cos(rx), sx = sin(rx), cy = cos(ry), sy = sin(ry);
    for (int i = 0; i < N; i++) {
        float fi = float(i);
        // Position 3D aléatoire sur sphère
        float theta = hash(fi) * 6.28318;
        float phi   = acos(2.0 * hash(fi + 100.0) - 1.0);
        float r     = 0.5 + hash(fi + 200.0) * 0.5 * (1.0 + uBass * 0.4);
        vec3 p = r * vec3(sin(phi)*cos(theta), sin(phi)*sin(theta), cos(phi));
        // Rotation Y
        p = vec3(cy*p.x + sy*p.z, p.y, -sy*p.x + cy*p.z);
        // Rotation X
        p = vec3(p.x, cx*p.y - sx*p.z, sx*p.y + cx*p.z);
        // Projection
        float fov = 1.5 + p.z * 0.3;
        vec2 proj = p.xy / fov;
        float size = 0.003 / fov * (1.0 + uHigh * 0.5);
        float d = length(uv - proj);
        float bright = smoothstep(size, size * 0.3, d);
        vec3 hue = 0.5 + 0.5 * cos(vec3(0.0, 0.4, 0.8) * 6.28 + fi * 0.18 + t);
        col += hue * bright * (0.8 + uOverall * 0.5);
    }
    fragColor = vec4(col, 1.0);
}`,

    'Lissajous Audio': `// Courbes de Lissajous réactives audio
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / (iResolution.y * 0.45);
    float t = iTime;
    vec3 col = vec3(0.0);
    // Plusieurs courbes Lissajous
    for (int k = 0; k < 5; k++) {
        float fk = float(k);
        float ax = 1.0 + fk, bx = 2.0 + fk * 0.5;
        float ay = 2.0 + fk * 0.3, by = 3.0 + fk * 0.7;
        float phase = fk * 0.628 + uBass * 0.5;
        float scale = 0.8 - fk * 0.12 + uMid * 0.1;
        vec2 curve;
        // Discrétisation
        float minD = 1e9;
        for (int i = 0; i < 256; i++) {
            float s = float(i) / 256.0 * 6.28318;
            curve = vec2(sin(ax * s + phase) * scale, sin(ay * s + by * t * 0.2));
            minD = min(minD, length(uv - curve));
        }
        float line = exp(-minD * (60.0 + uHigh * 40.0)) * 0.6;
        vec3 hue = 0.5 + 0.5 * cos(vec3(0.0, 0.4, 0.8) * 6.28 + fk * 1.2 + t * 0.2);
        col += hue * line;
    }
    col *= 1.0 + uOverall * 0.8;
    fragColor = vec4(col, 1.0);
}`,

    'Cristaux SDF': `// Cristaux SDF — formes géométriques raymarching
float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735;
}
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float map(vec3 p) {
    // Répétition spatiale
    vec3 q = p;
    q.xz = mod(q.xz + 1.5, 3.0) - 1.5;
    float t = iTime * 0.3;
    q.xy *= mat2(cos(t), -sin(t), sin(t), cos(t));
    float d = sdOctahedron(q, 0.4 + uBass * 0.15);
    d = min(d, sdBox(q + vec3(0.0, 0.8, 0.0), vec3(0.15, 0.15 + uMid * 0.1, 0.15)));
    return d;
}
vec3 normal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx)));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - iResolution.xy * 0.5) / iResolution.y;
    vec3 ro = vec3(0.0, 0.5, -3.0 + iTime * 0.5), rd = normalize(vec3(uv, 1.2));
    float t2 = 0.0;
    for (int i = 0; i < 80; i++) {
        float d = map(ro + rd * t2);
        if (d < 0.001 || t2 > 12.0) break;
        t2 += d;
    }
    vec3 col = vec3(0.03, 0.03, 0.08);
    if (t2 < 12.0) {
        vec3 p = ro + rd * t2, n = normal(p);
        float diff = max(dot(n, normalize(vec3(1.0, 2.0, -1.0))), 0.0);
        float spec = pow(max(dot(reflect(rd, n), normalize(vec3(1.0, 2.0, -1.0))), 0.0), 64.0);
        float fres = pow(1.0 - abs(dot(n, -rd)), 3.0);
        vec3 base = 0.5 + 0.5 * cos(vec3(0.0, 0.3, 0.6) * 6.28 + p.y * 2.0 + iTime * 0.2);
        col = base * diff * 0.8 + vec3(0.6, 0.8, 1.0) * spec * 0.5 + vec3(0.3, 0.5, 1.0) * fres * (0.3 + uHigh * 0.4);
        col += base * 0.05;
    }
    fragColor = vec4(col, 1.0);
}`,
};
