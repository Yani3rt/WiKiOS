import { Camera } from "sigma";
import type { CameraState } from "sigma/types";
import { ANIMATE_DEFAULTS, easings, type AnimateOptions } from "sigma/utils";

interface CameraTransition {
  target: Partial<CameraState>;
  complete(): void;
}

/** Own the motion clock: Sigma's duration:0 path can publish NaN for one frame. */
export class GraphMotionCamera extends Camera {
  private motionFrame: number | null = null;
  private transition: CameraTransition | null = null;
  private reducedMotion = false;
  private motionEnabled = true;
  private destroyed = false;
  private requestGeneration = 0;

  constructor(state?: Partial<CameraState>) {
    super();
    if (state) this.setState(state);
  }

  override isAnimated() {
    return this.transition !== null;
  }

  override animate(state: Partial<CameraState>, options: Partial<AnimateOptions>, callback: () => void): void;
  override animate(state: Partial<CameraState>, options?: Partial<AnimateOptions>): Promise<void>;
  override animate(
    state: Partial<CameraState>,
    options: Partial<AnimateOptions> = {},
    callback?: () => void,
  ): Promise<void> | void {
    if (!callback) return new Promise(resolve => this.animate(state, options, resolve));
    const generation = ++this.requestGeneration;
    this.stopTransition(false);
    // A replaced callback can synchronously request a newer animation.
    if (this.destroyed || !this.motionEnabled || generation !== this.requestGeneration) {
      callback();
      return;
    }

    const target = this.validateState(state);
    const duration = options.duration ?? ANIMATE_DEFAULTS.duration;
    if (this.reducedMotion || !Number.isFinite(duration) || duration <= 0) {
      this.setState(target);
      callback();
      return;
    }

    const easingOption = options.easing ?? ANIMATE_DEFAULTS.easing;
    const easing = typeof easingOption === "function" ? easingOption : easings[easingOption];
    const initial = this.getState();
    const startedAt = performance.now();
    const transition = {target, complete:callback};
    this.transition = transition;
    const tick: FrameRequestCallback = timestamp => {
      if (this.transition !== transition || this.destroyed) return;
      this.motionFrame = null;
      const progress = Math.max(0, Math.min(1, (timestamp - startedAt) / duration));
      if (progress >= 1) {
        this.stopTransition(true);
        return;
      }
      const coefficient = easing(progress);
      const next: Partial<CameraState> = {};
      for (const key of ["x", "y", "ratio", "angle"] as const) {
        if (typeof target[key] === "number") next[key] = initial[key] + (target[key] - initial[key]) * coefficient;
      }
      this.setState(next);
      // updated listeners may replace, finish, disable, or destroy this camera.
      if (this.transition === transition && !this.destroyed) this.motionFrame = requestAnimationFrame(tick);
    };
    this.motionFrame = requestAnimationFrame(tick);
  }

  private stopTransition(settle: boolean) {
    const transition = this.transition;
    this.transition = null;
    if (this.motionFrame !== null) cancelAnimationFrame(this.motionFrame);
    this.motionFrame = null;
    if (!transition) return;
    if (settle) this.setState(transition.target);
    transition.complete();
  }

  setReducedMotion(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    if (reducedMotion) this.stopTransition(true);
  }

  /** Stop at the current position and resolve the interrupted completion. */
  cancel() {
    this.requestGeneration += 1;
    this.stopTransition(false);
  }

  override disable() {
    this.motionEnabled = false;
    this.cancel();
    return super.disable();
  }

  override enable() {
    this.motionEnabled = true;
    return super.enable();
  }

  destroy() {
    this.destroyed = true;
    this.cancel();
  }
}
