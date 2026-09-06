/** Smooth, interruptible visibility; delays are a fraction of the whole transition. */
export function focusVisibility(from: number, to: number, progress: number, delay = 0): number {
  const t = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
  const eased = t * t * (3 - 2 * t);
  return from + (to - from) * eased;
}

/** Graph palette colors are six-digit hex. Alpha also fades shader-generated highlights. */
export function focusColor(color: string, visibility: number): string {
  if (visibility >= 1) return color;
  const channels = color.slice(1).match(/.{2}/g)!.map(channel => Number.parseInt(channel, 16));
  return `rgba(${channels.join(',')},${Math.max(0, visibility)})`;
}
