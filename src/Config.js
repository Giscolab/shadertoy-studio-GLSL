// Config.js — Shader Studio v5

function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r:parseInt(r[1],16), g:parseInt(r[2],16), b:parseInt(r[3],16) } : {r:0,g:0,b:0};
}

export const params = [
    // ── Géométrie & Shader ───────────────────────────────────────────────────
    {
        id:'geometryType', type:'select', name:'Géométrie', value:'sphere',
        options:{
            'Plane':'plane','Sphere':'sphere','Torus':'torus','Torus Knot':'torusknot',
            'Icosahedron':'icosahedron','Octahedron':'octahedron','Dodecahedron':'dodecahedron',
            'Cone':'cone','Cylinder':'cylinder','Capsule':'capsule','Ring':'ring',
            'Lathe':'lathe','Trefoil Tube':'trefoil',
            // Nouvelles géométries v5
            'Klein Bottle':'klein','Möbius Strip':'mobius','Spring Coil':'spring',
            'Super Ellipsoid':'superellipsoid','Heart':'heart',
            'Gear':'gear','Knot p2q3':'knot23','Knot p3q5':'knot35',
        }
    },
    {
        id:'noiseType', type:'select', name:'Shader', value:'simplex',
        options:{
            'Simplex':'simplex','Voronoi':'voronoi','FBM':'fbm','Plasma':'plasma',
            'Galaxy Swirl':'galaxy','Marble':'marble','Acid Wave':'acid',
            'Cellular':'cellular','Curl/Flow':'curl','Domain Warp':'warp',
            'Truchet':'truchet','Ridged':'ridged','Mandelbrot':'mandel',
            'Wave Interf.':'wave','Hexagonal':'hex','Reaction Diff.':'react',
        }
    },

    // ── Couleurs ─────────────────────────────────────────────────────────────
    { id:'uColorA', type:'color', name:'Couleur A', value:hexToRgb('#000000') },
    { id:'uColorB', type:'color', name:'Couleur B', value:hexToRgb('#210535') },
    { id:'uColorC', type:'color', name:'Couleur C', value:hexToRgb('#05f2db') },
    { id:'uColorD', type:'color', name:'Couleur D', value:hexToRgb('#ffffff') },

    // ── Animation ────────────────────────────────────────────────────────────
    { id:'uScale',  type:'float', name:'Échelle',   value:2.0, min:0.1, max:10.0 },
    { id:'uSpeed',  type:'float', name:'Vitesse',   value:0.5, min:0.0, max:3.0  },
    { id:'uTwist',  type:'float', name:'Twist',     value:0.0, min:-5.0,max:5.0  },
    { id:'uPulse',  type:'float', name:'Pulsation', value:2.0, min:0.0, max:10.0 },
    { id:'uMorphFactor', type:'float', name:'Morph', value:0.0, min:0.0, max:1.0 },

    // ── Déplacement ──────────────────────────────────────────────────────────
    { id:'uDisplacementStrength', type:'float', name:'Déplacement', value:0.4, min:0.0, max:3.0 },

    // ── Matière ──────────────────────────────────────────────────────────────
    { id:'uMetalness',      type:'float', name:'Métal',         value:0.0, min:0.0, max:1.0  },
    { id:'uLightIntensity', type:'float', name:'Lumière',       value:1.2, min:0.0, max:3.0  },
    { id:'uRimPower',       type:'float', name:'Rim Power',     value:3.0, min:1.0, max:12.0 },
    { id:'uRimColor',       type:'color', name:'Rim Color',     value:hexToRgb('#05f2db')    },
    { id:'uFresnelStrength',type:'float', name:'Fresnel',       value:4.0, min:1.0, max:14.0 },
    { id:'uGlowRadius',     type:'float', name:'Mouse Glow',    value:0.8, min:0.0, max:3.0  },

    // ── Post-traitement image ─────────────────────────────────────────────────
    { id:'uContrast',   type:'float', name:'Contraste',  value:1.1, min:0.5, max:3.0 },
    { id:'uSaturation', type:'float', name:'Saturation', value:1.3, min:0.0, max:3.0 },
    { id:'uGamma',      type:'float', name:'Gamma',      value:1.1, min:0.4, max:2.5 },
    { id:'uTextureMix', type:'float', name:'Texture Mix',value:0.0, min:0.0, max:1.0 },

    { id:'uLayerBlend1', type:'float', name:'Layer1 Mode', value:0.0, min:0.0, max:2.0 },
    { id:'uLayerBlend2', type:'float', name:'Layer2 Mode', value:1.0, min:0.0, max:2.0 },
    { id:'uLayerOpacity1', type:'float', name:'Layer1 Opacity', value:0.0, min:0.0, max:1.0 },
    { id:'uLayerOpacity2', type:'float', name:'Layer2 Opacity', value:0.0, min:0.0, max:1.0 },

    // ── Flags ────────────────────────────────────────────────────────────────
    { id:'cyberpunkMode', type:'boolean', name:'RGB Shift',   value:false },
    { id:'glitchMode',    type:'boolean', name:'Glitch',      value:false },
    { id:'pixelMode',     type:'boolean', name:'Pixel',       value:false },
    { id:'vignetteMode',  type:'boolean', name:'Vignette',    value:true  },
    { id:'wireframe',     type:'boolean', name:'Wireframe',   value:false },
    { id:'autoRotate',    type:'boolean', name:'Auto-Rotate', value:true  },

    // ── Scène ────────────────────────────────────────────────────────────────
    { id:'bgColor',       type:'color',  name:'Fond',              value:hexToRgb('#050505') },
    { id:'rotationSpeed', type:'float',  name:'Vitesse Rotation',  value:0.3, min:0.0, max:3.0 },

    // ── Post FX ──────────────────────────────────────────────────────────────
    { id:'bloomStrength',  type:'float', name:'Bloom Force',  value:1.2, min:0.0, max:5.0  },
    { id:'bloomRadius',    type:'float', name:'Bloom Radius', value:0.4, min:0.0, max:1.0  },
    { id:'bloomThreshold', type:'float', name:'Bloom Seuil',  value:0.2, min:0.0, max:1.0  },
    { id:'glitchAmount',   type:'float', name:'Glitch Force', value:0.5, min:0.0, max:1.0  },
    { id:'pixelSize',      type:'float', name:'Pixel Size',   value:4.0, min:1.0, max:32.0 },
    { id:'vignetteAmount', type:'float', name:'Vignette',     value:0.5, min:0.0, max:2.0  },
];

// ── Params audio ─────────────────────────────────────────────────────────────
export const audioParams = [
    { id:'mapBassTo',  type:'select', name:'Bass → effet', value:'displacement',
      options:{'Déplacement':'displacement','Vitesse':'speed','Échelle':'scale','Rien':'none'} },
    { id:'mapMidTo',   type:'select', name:'Mid → effet',  value:'speed',
      options:{'Déplacement':'displacement','Vitesse':'speed','Échelle':'scale','Rien':'none'} },
    { id:'mapHighTo',  type:'select', name:'High → effet', value:'scale',
      options:{'Déplacement':'displacement','Vitesse':'speed','Échelle':'scale','Rien':'none'} },
    { id:'gainBass',   type:'float', name:'Gain Bass',  value:2.0, min:0, max:8  },
    { id:'gainMid',    type:'float', name:'Gain Mid',   value:1.5, min:0, max:8  },
    { id:'gainHigh',   type:'float', name:'Gain High',  value:1.0, min:0, max:8  },
    { id:'smoothBass', type:'float', name:'Smooth Bass',value:0.75,min:0, max:0.98 },
    { id:'smoothMid',  type:'float', name:'Smooth Mid', value:0.70,min:0, max:0.98 },
    { id:'smoothHigh', type:'float', name:'Smooth High',value:0.65,min:0, max:0.98 },
    { id:'beatFlash',     type:'boolean',name:'Flash sur Beat', value:true  },
    { id:'beatThreshold', type:'float',  name:'Seuil Beat',    value:0.55, min:0.1, max:1.0 },
    { id:'sensitivity',   type:'float',  name:'Sensibilité',   value:1.0,  min:0.1, max:5.0 },
    { id:'masterVolume',  type:'float',  name:'Volume',        value:1.0,  min:0.0, max:1.5 },
];

// ── Params export vidéo ───────────────────────────────────────────────────────
export const videoParams = {
    duration:    10,
    format:      null,       // sera rempli dynamiquement avec les formats détectés
    compression: 'Haute qualité',
    resolution:  'Source (native)',
    fps:         60,
};
