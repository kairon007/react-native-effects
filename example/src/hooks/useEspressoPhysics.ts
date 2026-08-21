import { useCallback, useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

/** Fraction of the screen height the surface sits at when the espresso cup is full (demitasse fill). */
const REST_LEVEL = 0.72;
/** Dense, viscous espresso surface spring (~1.8 Hz, ζ ≈ 0.52) — viscous lag and smooth recovery. */
const STIFFNESS = 110;
const DAMPING = 12;
/** In-plane tilt below this (rad) never drains. */
const DRAIN_START = 0.32;
/** In-plane tilt at which the sip drain rate saturates. */
const DRAIN_FULL = 1.25;
const MAX_DRAIN_RATE = 0.45; // level / sec
const EXTRACTION_RATE = 0.3; // refill / sec
/** Per-sample accelerometer jerk below this is treated as sensor noise. */
const JERK_NOISE_FLOOR = 0.02;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type EspressoSim = {
  /** Confidence-blended sensor angle the spring chases (rad, unwrapped). */
  targetAngle: number;
  /** Sprung display angle written to the shader. */
  angle: number;
  angleVel: number;
  /** In-plane signal confidence 0..1 (0 when phone lies flat). */
  conf: number;
  /** Gravity points out of the top half of the screen → max drain (sipping). */
  pastHorizontal: boolean;
  /** Fluid level: 1 = full double shot, 0 = empty. */
  level: number;
  /** Espresso shot extraction state. */
  extracting: boolean;
  extractT: number;
  slosh: number;
  steamPhase: number;
  swirlPhase: number;
  heat: number;
  lastAx: number;
  lastAy: number;
  jerkAccum: number;
};

/**
 * The physics of an authentic Italian Espresso demitasse.
 *
 * Senses tilt via the accelerometer, simulates viscous liquid sloshing,
 * sipping drainage when tilted, rising steam wisps, crema swirl turbulence,
 * and a rich golden-brown espresso extraction stream on tap.
 *
 * Writes the live channel every frame:
 * `u.live = (surfaceAngle rad, surfaceLevelOnScreen 0..1, sloshEnergy 0..1, extractIntensity 0..1)`
 * `u.liveData[0] = (steamPhase, heat 0..1, swirlPhase, cremaQuality 0..1)`
 */
export function useEspressoPhysics(): {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  pullShot: () => void;
} {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, REST_LEVEL, 0, 0, 0, 1, 0, 1]);

  const simRef = useRef<EspressoSim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      targetAngle: 0,
      angle: 0,
      angleVel: 0,
      conf: 0,
      pastHorizontal: false,
      level: 1,
      extracting: false,
      extractT: 0,
      slosh: 0,
      steamPhase: 0,
      swirlPhase: 0,
      heat: 0.85,
      lastAx: 0,
      lastAy: -1,
      jerkAccum: 0,
    };
  }

  // Accelerometer → target liquid surface angle.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const ok = await Accelerometer.isAvailableAsync();
        if (!ok || cancelled) {
          return;
        }
        Accelerometer.setUpdateInterval(16);
        sub = Accelerometer.addListener(({ x, y }) => {
          const s = simRef.current as EspressoSim;

          const reading = Math.atan2(x, -y);
          const conf = Math.min(1, Math.hypot(x, y) / 0.35);

          let delta = reading - s.targetAngle;
          if (delta > Math.PI) {
            delta -= 2 * Math.PI;
          } else if (delta < -Math.PI) {
            delta += 2 * Math.PI;
          }
          s.targetAngle += delta * conf * conf;
          s.conf = conf;
          s.pastHorizontal = y > 0;

          const jerk = Math.hypot(x - s.lastAx, y - s.lastAy);
          s.lastAx = x;
          s.lastAy = y;
          s.jerkAccum += Math.max(0, jerk - JERK_NOISE_FLOOR);
        });
      } catch {
        // Fallback for simulators without accelerometer
      }
    })();

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
    };
  }, []);

  // Simulation loop: viscous spring, sipping, extraction, thermal steam, and crema swirl.
  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const step = (now: number) => {
      const s = simRef.current as EspressoSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      // Spring dynamics with viscous fluid damping
      s.angleVel += (s.targetAngle - s.angle) * STIFFNESS * dt;
      s.angleVel -= s.angleVel * DAMPING * dt;
      s.angle += s.angleVel * dt;

      // Slosh energy with viscous decay
      s.slosh = Math.min(
        1,
        s.slosh + Math.abs(s.angleVel) * 0.14 * dt + s.jerkAccum * 1.6
      );
      s.jerkAccum = 0;
      s.slosh *= Math.exp(-dt / 0.85);

      // Sipping / Drain rate
      const tiltMag = Math.abs(s.targetAngle);
      const rate =
        MAX_DRAIN_RATE *
        s.conf *
        (s.pastHorizontal ? 1 : smoothstep(DRAIN_START, DRAIN_FULL, tiltMag));
      s.level = Math.max(0, s.level - rate * dt);

      // Espresso extraction (refill / pull shot)
      let extract = 0;
      if (s.extracting) {
        s.extractT += dt;
        extract =
          smoothstep(0, 0.25, s.extractT) * (1 - smoothstep(0.94, 1, s.level));
        s.level = Math.min(1, s.level + EXTRACTION_RATE * dt);
        s.heat = Math.min(1, s.heat + dt * 0.5);
        if (s.level >= 1) {
          s.extracting = false;
        }
      } else {
        // Slow cooling down towards warm baseline
        s.heat = Math.max(0.55, s.heat - dt * 0.015);
      }

      // Steam & Crema swirl phase integration
      const steamSpeed = 0.8 + s.heat * 1.2 + extract * 2.0;
      s.steamPhase += dt * steamSpeed;

      const swirlSpeed = 0.5 + s.slosh * 2.2 + extract * 3.5;
      s.swirlPhase += dt * swirlSpeed;

      const cremaQuality = Math.min(1, 0.7 + s.heat * 0.3);

      setParamsSynchronizable(
        s.angle,
        s.level * REST_LEVEL,
        s.slosh,
        extract,
        s.steamPhase,
        s.heat,
        s.swirlPhase,
        cremaQuality
      );
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  const pullShot = useCallback(() => {
    const s = simRef.current as EspressoSim;
    if (!s.extracting && s.level < 1) {
      s.extracting = true;
      s.extractT = 0;
    }
  }, []);

  return { paramsSynchronizable, pullShot };
}
