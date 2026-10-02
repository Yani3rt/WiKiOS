export type GraphDetailLevel = 'overview' | 'neighborhood' | 'detail';
export function getGraphDetailLevel(magnification: number, previous: GraphDetailLevel): GraphDetailLevel {
  if (!Number.isFinite(magnification) || magnification <= 0) return 'overview';
  if (magnification > 2.4 || (previous === 'detail' && magnification >= 2.2)) return 'detail';
  if (magnification > 1.5 || (previous !== 'overview' && magnification >= 1.3)) return 'neighborhood';
  return 'overview';
}
export function getGraphNeighborhoodOpacity(magnification: number) {
  if (!Number.isFinite(magnification)) return 0;
  const progress = Math.max(0, Math.min(1, (magnification - 1.3) / 1));
  return 1 - progress * progress * (3 - 2 * progress);
}
export function isGraphLabelEligible(level: GraphDetailLevel, node: {
  persistent: boolean; hub: boolean; independent: boolean; context: boolean;
}) {
  return node.context || level === 'detail' || (level === 'overview' ? node.hub || node.independent : node.persistent);
}
