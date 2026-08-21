import { useMemo } from 'react';
import {
  ShaderView,
  type ColorInput,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type Props = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'colors'
> & {
  /**
   * Live channel from `useEspressoPhysics`:
   * `u.live = (surfaceAngle rad, surfaceLevelOnScreen, sloshEnergy, extractIntensity)`,
   * `u.liveData[0] = (steamPhase, heat, swirlPhase, cremaQuality)`.
   */
  paramsSynchronizable: ParamsSynchronizable;
  /** Deep dark roast espresso core. */
  liquidColor?: ColorInput;
  /** Hazelnut golden crema base. */
  cremaColor?: ColorInput;
  /** Porcelain / ceramic demitasse interior. */
  cupColor?: ColorInput;
};

/**
 * The phone as a cup of authentic Italian espresso — deep obsidian coffee body,
 * a thick velvety crema head with tigrato (tiger-stripe) marbling, rising ethereal
 * steam wisps in the headspace, porcelain demitasse interior with crema residue,
 * and a rich golden extraction stream when pulling a fresh shot on tap.
 */
export default function EspressoCup({
  paramsSynchronizable,
  liquidColor = '#180a04',
  cremaColor = '#c7782b',
  cupColor = '#f3efe8',
  ...rest
}: Props) {
  const colors = useMemo(
    () => [liquidColor, cremaColor, cupColor],
    [liquidColor, cremaColor, cupColor]
  );

  return (
    <ShaderView
      fragmentShader={ESPRESSO_SHADER}
      colors={colors}
      paramsSynchronizable={paramsSynchronizable}
      {...rest}
    />
  );
}

const ESPRESSO_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
  live:       vec4<f32>,
  liveData:   array<vec4<f32>, 96>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn hash11(t: f32) -> f32 {
  return fract(sin(t * 12345.564) * 7658.76);
}

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  let m = mat2x2<f32>(1.6, 1.2, -1.2, 1.6);
  for (var i = 0; i < 4; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

// Higher-detail warped turbulence for espresso crema marbling (tigrato)
fn cremaFbm(p: vec2<f32>) -> f32 {
  let q = vec2<f32>(fbm(p + vec2<f32>(0.0, 0.0)),
                    fbm(p + vec2<f32>(5.2, 1.3)));
  let r = vec2<f32>(fbm(p + 4.0 * q + vec2<f32>(1.7, 9.2)),
                    fbm(p + 4.0 * q + vec2<f32>(8.3, 2.8)));
  return fbm(p + 3.5 * r);
}

// Micro-pores for the dense, velvety espresso foam emulsion
fn microPores(p0: vec2<f32>, cells: f32, seed: f32) -> f32 {
  let p = p0 * cells + seed * 13.7;
  let cell = floor(p);
  let rnd = hash21(cell + seed * 4.3);
  let ctr = vec2<f32>(0.3 + fract(rnd * 7.31) * 0.4,
                      0.3 + fract(rnd * 13.7) * 0.4);
  let rel = fract(p) - ctr;
  let r = 0.12 + fract(rnd * 5.13) * 0.16;
  let dot1 = smoothstep(r, r * 0.3, length(rel));
  return dot1 * (0.5 + 0.5 * fract(rnd * 3.71));
}

// Rising thermal steam plumes in world space
fn steamField(p0: vec2<f32>, steamPhase: f32) -> f32 {
  var p = p0;
  p.y = p.y - steamPhase * 0.45;
  
  // Curling swirl
  let curl = sin(p.y * 3.5 + steamPhase * 0.7) * 0.18;
  p.x = p.x + curl;
  
  let n1 = fbm(vec2<f32>(p.x * 3.2, p.y * 2.2));
  let n2 = fbm(vec2<f32>(p.x * 6.5 + 2.4, p.y * 4.5 - steamPhase * 0.2));
  
  let plume = smoothstep(0.42, 0.78, n1 * 0.65 + n2 * 0.35);
  // Fade gently at edges and with height
  let centerMask = smoothstep(0.85, 0.15, abs(p0.x));
  return plume * centerMask;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let screenUV = ndc * 0.5 + 0.5; // y-up: 1.0 is top

  let ang = clamp(u.live.x, -1.2, 1.2);
  let lvl = u.live.y;
  let slosh = clamp(u.live.z, 0.0, 1.0);
  let extract = clamp(u.live.w, 0.0, 1.0);

  let steamPhase = u.liveData[0].x;
  let heat = clamp(u.liveData[0].y, 0.0, 1.0);
  let swirlPhase = u.liveData[0].z;
  let cremaQuality = clamp(u.liveData[0].w, 0.0, 1.0);

  // Volume-conserving surface line
  let slope = tan(ang) * aspect;
  let m = max(abs(slope), 0.0001);
  let wedgeH = m * (sqrt(2.0 * lvl / m) - 0.5);
  let h0 = select(lvl, wedgeH, lvl < m * 0.5);

  let cx = (screenUV.x - 0.5) * aspect;
  let nearEmpty = smoothstep(0.0, 0.025, lvl);

  // Dense, viscous espresso slosh wave harmonics
  let waveAmp = (0.003 + slosh * 0.022 + extract * 0.015) * nearEmpty;
  let waves = waveAmp * (sin(cx * 11.0 - t * 3.4) * 0.6
                       + sin(cx * 19.5 + t * 4.8) * 0.3
                       + sin(cx * 29.0 - t * 6.2) * 0.1);

  let surfH = h0 + slope * (screenUV.x - 0.5) + waves;

  // Rigid surface-aligned frame
  let ca = cos(ang);
  let sa = sin(ang);
  let dvec = vec2<f32>(cx, screenUV.y - h0);
  let fu = dvec.x * ca + dvec.y * sa;
  let fv = -dvec.x * sa + dvec.y * ca;

  let feather = 3.5 / u.resolution.y;
  let inLiquid = smoothstep(surfH, surfH - feather, screenUV.y);

  // Constant-thickness dense crema head
  let cremaThick = 0.095 * (1.0 + extract * 0.4);
  let cremaShift = (1.0 - smoothstep(0.0, 0.12, lvl)) * (1.0 - extract) * (cremaThick + 0.05);
  let vScale = 1.0 / max(ca, 0.35);

  let cremaLump = vnoise(vec2<f32>(fu * 6.0, t * 0.05));
  let cremaTop = surfH - cremaShift + cremaThick * (0.85 + cremaLump * 0.25) * vScale;
  let cremaBot = surfH - cremaShift - cremaThick * 0.25 * vScale;

  let inCrema = smoothstep(cremaTop, cremaTop - feather, screenUV.y)
              * smoothstep(cremaBot - feather, cremaBot, screenUV.y);

  // --- 1. Porcelain Demitasse Cup Interior Background ---
  // Warm ceramic white/cream with ambient curvature and rim illumination
  let cupBase = u.params0.rgb; // or derived from cupColor
  let porcelain = select(vec3<f32>(0.95, 0.93, 0.89), cupBase, length(cupBase) > 0.1);
  
  // Radial inner-cup lighting and depth shadow
  let cupDistX = abs(screenUV.x - 0.5) * 2.0;
  let cupDepthShadow = 1.0 - 0.22 * cupDistX * cupDistX - 0.15 * (1.0 - screenUV.y);
  var wall = porcelain * cupDepthShadow;

  // Coffee lacing / crema residue clinging to the ceramic wall
  let laceCoord = vec2<f32>(cx * 5.0, screenUV.y * 6.5);
  let laceNoise = fbm(laceCoord);
  let laceStreaks = smoothstep(0.55, 0.82, laceNoise) * smoothstep(surfH, surfH + 0.25, screenUV.y);
  let laceColor = vec3<f32>(0.48, 0.26, 0.11) * (0.8 + 0.4 * vnoise(laceCoord * 2.0));
  wall = mix(wall, laceColor, laceStreaks * 0.65);

  // --- 2. Espresso Liquid Body ---
  var espresso = u.color0.rgb;
  let depth = clamp((surfH - screenUV.y) * 1.5, 0.0, 1.0);
  // Viscous dark coffee: deeper darkness at the base, warm reddish-amber translucency near edge
  let amberGlow = vec3<f32>(0.45, 0.18, 0.06);
  espresso = mix(amberGlow, espresso * 0.5, depth);
  let internalSwirl = fbm(vec2<f32>(cx * 3.0 + t * 0.04, screenUV.y * 3.0 - t * 0.06));
  espresso = espresso * (0.92 + internalSwirl * 0.16);

  // --- 3. Authentic Crema Layer (Tigrato / Tiger-Striping) ---
  var crema = vec3<f32>(0.0);
  if (inCrema > 0.001) {
    let fq = vec2<f32>(fu, fv + cremaShift * ca);
    
    // Crema coordinates with swirl displacement
    let cremaUV = vec2<f32>(fq.x * 2.8, fq.y * 4.0);
    let swirlFlow = vec2<f32>(
      sin(cremaUV.y * 2.0 + swirlPhase * 0.3) * 0.2,
      cos(cremaUV.x * 2.0 + swirlPhase * 0.3) * 0.2
    );
    let warpedUV = cremaUV + swirlFlow;

    // Multi-octave tigrato marbling
    let tigrato = cremaFbm(warpedUV * 2.2);
    let darkFleck = smoothstep(0.58, 0.85, cremaFbm(warpedUV * 4.5 + 8.1));
    let brightVein = smoothstep(0.48, 0.75, vnoise(warpedUV * 6.0));

    // Color palette: Roasted Dark Caramel -> Golden Hazelnut -> Warm Crema Cream
    let cDark = vec3<f32>(0.28, 0.11, 0.03);      // Dark espresso roast flecks
    let cHazel = u.color1.rgb;                   // Hazelnut crema base
    let cGolden = vec3<f32>(0.92, 0.65, 0.28);    // Rich golden-caramel
    let cBright = vec3<f32>(0.98, 0.82, 0.54);    // Blonding micro-cream

    var c = mix(cDark, cHazel, smoothstep(0.2, 0.55, tigrato));
    c = mix(c, cGolden, smoothstep(0.55, 0.78, tigrato));
    c = mix(c, cBright, brightVein * 0.45);
    c = mix(c, cDark * 0.8, darkFleck * 0.5);

    // Micro-pores for the velvety emulsion texture
    let pores = microPores(fq, 280.0, 1.0) * 0.06;
    let pores2 = microPores(fq, 450.0, 2.0) * 0.04;
    c = c - (pores + pores2);

    // Oily specular sheen
    let specSheen = smoothstep(0.65, 0.95, vnoise(fq * 14.0 + 3.0)) * 0.18;
    c = c + vec3<f32>(specSheen);

    // Crema gradient: slightly soaked near liquid, rich and golden above
    let fpos = clamp((fv + cremaShift * ca) / max(cremaThick, 0.001), 0.0, 1.0);
    crema = mix(c * 0.85, c, smoothstep(0.0, 0.3, fpos));
  }

  // --- 4. Rising Steam Plumes in Headspace ---
  var steam = vec3<f32>(0.0);
  let worldY = (screenUV.y - surfH);
  if (worldY > 0.0 && heat > 0.1) {
    // World up-aligned coordinate for steam so it rises vertically regardless of tilt
    let steamUV = vec2<f32>(cx * ca + (screenUV.y - 0.5) * sa,
                            (screenUV.y - 0.5) * ca - cx * sa);
    let sVal = steamField(steamUV, steamPhase);
    let heightFade = smoothstep(0.0, 0.08, worldY) * smoothstep(0.75, 0.15, worldY);
    let steamIntensity = sVal * heightFade * (0.2 + heat * 0.35 + extract * 0.4);
    steam = vec3<f32>(0.96, 0.93, 0.89) * steamIntensity;
  }

  // --- 5. Composite Layers: Cup -> Espresso -> Crema ---
  var col = wall;
  col = mix(col, espresso, inLiquid);
  col = mix(col, crema, inCrema);

  // Glossy meniscus highlight where crema contacts porcelain
  let mdist = screenUV.y - surfH;
  let glint = 0.75 + 0.25 * sin(cx * 24.0 + t * 2.5);
  col = col + vec3<f32>(1.0, 0.88, 0.65) * exp(-mdist * mdist * 75000.0) * glint * 0.22 * nearEmpty;

  // Add warm steam over the headspace
  col = col + steam;

  // --- 6. Espresso Extraction Stream & Splash ---
  if (extract > 0.001) {
    let sx = cx;
    let streamW = (0.009 + 0.007 * screenUV.y) * (0.7 + extract * 0.3);
    let streamMask = smoothstep(streamW, streamW * 0.3, abs(sx))
                   * smoothstep(surfH - 0.02, surfH + 0.06, screenUV.y) * extract;
    
    // Extraction flow texture: golden-crema swirls inside the pouring stream
    let flowTex = 0.7 + 0.5 * vnoise(vec2<f32>(sx * 180.0, screenUV.y * 10.0 - t * 16.0));
    let streamCol = mix(vec3<f32>(0.35, 0.15, 0.04), vec3<f32>(0.95, 0.68, 0.32), flowTex);
    col = mix(col, streamCol, streamMask * 0.9);

    // Extraction splash & foam churn at impact center
    let splashDist = length(vec2<f32>(cx * 1.7, screenUV.y - surfH));
    let churn = 0.6 + 0.8 * vnoise(vec2<f32>(cx * 70.0, surfH * 35.0 + t * 14.0));
    let splashRing = exp(-splashDist * splashDist * 350.0) * extract * churn;
    col = col + vec3<f32>(0.98, 0.75, 0.38) * splashRing * 0.6;
  }

  // --- 7. Porcelain Demitasse Side Curvature & Glaze ---
  let ex = abs(screenUV.x - 0.5) * 2.0;
  // Cup rim ambient occlusion & ceramic specular glaze
  col = col * (1.0 - 0.18 * ex * ex * ex);
  col = col + vec3<f32>(0.08) * exp(-(screenUV.x - 0.78) * (screenUV.x - 0.78) * 50.0);

  // Vignette + dither to prevent color banding in rich espresso tones
  let vd = screenUV - 0.5;
  col = col * (1.0 - dot(vd, vd) * 0.3);
  col = col + (hash21(screenUV * u.resolution.xy) - 0.5) * (1.5 / 255.0);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
