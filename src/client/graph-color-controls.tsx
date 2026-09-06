import { useState } from 'react';
import { ArrowUp, ArrowDown, Settings2, X } from 'lucide-react';
import type { GraphColorGroup, GraphColorPreferences } from './graph-color-model';

export function GraphColorControls({ preferences, topics, groups, activeGroup, onChange, onHighlight }: {
  preferences: GraphColorPreferences; topics: string[]; groups: GraphColorGroup[]; activeGroup: string | null;
  onChange(value: GraphColorPreferences): void; onHighlight(id: string | null): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const move = (index: number, direction: number) => {
    const priority = [...preferences.priority];
    [priority[index], priority[index + direction]] = [priority[index + direction], priority[index]];
    onChange({ ...preferences, priority });
  };
  return <section className="graph-color-controls" aria-label="Graph colors">
    <div className="graph-color-bar">
      <span className="graph-mode-badge">2D</span>
      <label htmlFor="graph-color-mode">Color by</label>
      <select id="graph-color-mode" value={preferences.mode} onChange={e => { onChange({ ...preferences, mode: e.target.value as GraphColorPreferences['mode'] }); onHighlight(null); }}>
        <option value="topics">Tags / topics</option><option value="folders">Folders</option><option value="none">None</option>
      </select>
      {preferences.mode === 'topics' && <button type="button" aria-label="Configure topic priority" aria-expanded={open} aria-controls="graph-topic-priority" onClick={() => setOpen(!open)}><Settings2 size={16} /></button>}
    </div>
    {open && preferences.mode === 'topics' && <section id="graph-topic-priority" className="graph-priority-panel" aria-labelledby="graph-priority-title" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      <div className="graph-priority-heading"><h2 id="graph-priority-title">Topic priority</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close topic priority"><X size={16} /></button></div>
      <p>First matching topic sets the color. Saved for this vault in this browser.</p>
      <ol>{preferences.priority.map((topic, index) => <li key={topic}>
        <span className="graph-priority-rank">{index + 1}</span><span className="graph-priority-name">{topic}</span>
        <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${topic} up`}><ArrowUp size={14} /></button>
        <button type="button" disabled={index === preferences.priority.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${topic} down`}><ArrowDown size={14} /></button>
        <button type="button" onClick={() => onChange({ ...preferences, priority: preferences.priority.filter(t => t !== topic) })} aria-label={`Remove ${topic}`}><X size={14} /></button>
      </li>)}</ol>
      <input aria-label="Find topics to add" placeholder="Find topics to add" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="graph-available-topics">{topics.filter(t => !preferences.priority.includes(t) && t.toLowerCase().includes(query.toLowerCase())).map(topic => <button type="button" key={topic} onClick={() => onChange({ ...preferences, priority: [...preferences.priority, topic] })}>+ {topic}</button>)}</div>
    </section>}
    <div className="graph-color-legend" aria-label="Color legend">
      {groups.map(group => <button type="button" key={group.id} aria-pressed={activeGroup === group.id} onClick={() => onHighlight(activeGroup === group.id ? null : group.id)} title={`${group.label}: ${group.count} notes`}>
        <span className="graph-color-dot" style={{ backgroundColor: group.color }} /><span>{group.label}</span><span className="graph-group-count">{group.count}</span>
      </button>)}
    </div>
  </section>;
}
