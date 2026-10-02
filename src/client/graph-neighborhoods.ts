import type { ColoredGraphData } from '@/lib/wiki-shared';

export interface GraphNeighborhood {
  id: string;
  label: string;
  members: string[];
  hubs: string[];
}
export interface GraphNeighborhoods {
  groups: GraphNeighborhood[];
  membership: Map<string, string>;
  independent: string[];
  passes: number;
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** A deterministic, bounded local-modularity partition of real links, not inferred semantics. */
export function buildGraphNeighborhoods(data: ColoredGraphData): GraphNeighborhoods {
  const nodes = new Map(data.nodes.map(node => [node.slug, node]));
  const slugs = [...nodes.keys()].sort(compare);
  const adjacency = new Map(slugs.map(slug => [slug, new Map<string, number>()]));
  for (const edge of [...data.edges].sort((a,b) => compare(a.source,b.source) || compare(a.target,b.target) || a.weight-b.weight)) {
    if (edge.source === edge.target || !adjacency.has(edge.source) || !adjacency.has(edge.target) || !Number.isFinite(edge.weight) || edge.weight <= 0) continue;
    const source = adjacency.get(edge.source)!, target = adjacency.get(edge.target)!;
    source.set(edge.target, (source.get(edge.target) ?? 0) + edge.weight);
    target.set(edge.source, (target.get(edge.source) ?? 0) + edge.weight);
  }
  const degrees = new Map(slugs.map(slug => [slug, [...adjacency.get(slug)!.values()].reduce((a,b) => a+b, 0)]));
  const totalDegree = [...degrees.values()].reduce((a,b) => a+b, 0);
  const communities = new Map(slugs.map(slug => [slug, slug]));
  const totals = new Map(degrees);
  const ordered = [...slugs].sort((a,b) => degrees.get(b)!-degrees.get(a)! || compare(a,b));
  let passes = 0;
  if (totalDegree > 0) for (; passes < 20;) {
    passes++;
    let moved = false;
    for (const slug of ordered) {
      const degree = degrees.get(slug)!;
      if (!degree) continue;
      const old = communities.get(slug)!;
      const weights = new Map<string,number>();
      for (const [neighbor,weight] of adjacency.get(slug)!) {
        const group = communities.get(neighbor)!;
        weights.set(group, (weights.get(group) ?? 0)+weight);
      }
      totals.set(old, totals.get(old)!-degree);
      const score = (group:string) => (weights.get(group) ?? 0)-degree*(totals.get(group) ?? 0)/totalDegree;
      let best = old, bestScore = score(old);
      for (const group of [...weights.keys()].sort(compare)) {
        const candidate = score(group);
        if (candidate > bestScore + 1e-10) { best=group; bestScore=candidate; }
      }
      communities.set(slug,best);
      totals.set(best,(totals.get(best) ?? 0)+degree);
      moved ||= best !== old;
    }
    if (!moved) break;
  }
  const buckets = new Map<string,string[]>();
  for (const slug of slugs) {
    const id = communities.get(slug)!;
    const bucket = buckets.get(id) ?? [];
    bucket.push(slug); buckets.set(id,bucket);
  }
  const groups: GraphNeighborhood[] = [];
  const membership = new Map<string,string>();
  const independent: string[] = [];
  for (const members of [...buckets.values()].sort((a,b) => compare(a[0],b[0]))) {
    if (members.length < 3) { independent.push(...members); continue; }
    const hubs = [...members].sort((a,b) => degrees.get(b)!-degrees.get(a)! || compare(a,b)).slice(0,2);
    const majority = (values: (slug:string)=>string[]) => {
      const counts = new Map<string,number>();
      for (const slug of members) for (const value of new Set(values(slug).filter(Boolean))) counts.set(value,(counts.get(value) ?? 0)+1);
      return [...counts].sort(([a,ac],[b,bc]) => bc-ac || compare(a,b)).find(([,count]) => count > members.length/2)?.[0];
    };
    const label = majority(slug => data.colorSources[slug]?.topics ?? [])
      ?? majority(slug => data.colorSources[slug]?.folder ? [data.colorSources[slug].folder!] : [])
      ?? nodes.get(hubs[0])!.title;
    const group = {id:members[0],label,members,hubs};
    groups.push(group);
    for (const member of members) membership.set(member,group.id);
  }
  const labelCounts = new Map<string,number>();
  for (const group of groups) labelCounts.set(group.label,(labelCounts.get(group.label) ?? 0)+1);
  for (const group of groups) if (labelCounts.get(group.label)! > 1) {
    group.label = `${group.label} · ${nodes.get(group.hubs[0])!.title}`;
  }
  return {groups,membership,independent:independent.sort(compare),passes};
}
