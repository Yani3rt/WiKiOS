import {ChevronDown, ChevronUp, Search, X} from "lucide-react";
import {useEffect, useRef, useState, type RefObject} from "react";

/** Search visible note text, including words split by inline Markdown formatting. */
export function findNoteRanges(root: HTMLElement, query: string): Range[] {
  if (!query.trim()) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const groups = new Map<Element, Text[]>();
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || parent.closest('button, script, style, [hidden], [aria-hidden="true"]')) continue;
    const block = parent.closest('p, h1, h2, h3, h4, h5, h6, li, pre, td, th, blockquote') ?? root;
    const nodes = groups.get(block) ?? [];
    nodes.push(node); groups.set(block, nodes);
  }
  const ranges: Range[] = [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'giu');
  for (const nodes of groups.values()) {
    const text = nodes.map(node => node.data).join('');
    for (const match of text.matchAll(pattern)) {
      const start = match.index!, end = start + match[0].length;
      const range = document.createRange();
      let offset = 0;
      for (const node of nodes) {
        const next = offset + node.length;
        if (start >= offset && start < next) range.setStart(node, start - offset);
        if (end > offset && end <= next) {range.setEnd(node, end - offset); break;}
        offset = next;
      }
      ranges.push(range);
    }
  }
  return ranges;
}

export function FindInNote({readerRef, noteKey}: {readerRef: RefObject<HTMLDivElement | null>; noteKey: string}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [ranges, setRanges] = useState<Range[]>([]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const supported = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
  const close = () => {setOpen(false); triggerRef.current?.focus();};

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape' && open && !document.querySelector('[aria-modal="true"]')) {
        event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'f' && supported && !triggerRef.current?.closest('[inert]') && !document.querySelector('[aria-modal="true"]')) {
        event.preventDefault(); setOpen(true); inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [supported, open]);
  useEffect(() => {if (open) inputRef.current?.focus();}, [open]);
  useEffect(() => {
    const root = readerRef.current?.querySelector<HTMLElement>('.workspace-reader');
    const matches = open && root ? findNoteRanges(root, query) : [];
    setRanges(matches); setIndex(0);
    if (!supported) return;
    CSS.highlights.set('note-find', new Highlight(...matches));
    return () => {CSS.highlights.delete('note-find'); CSS.highlights.delete('note-find-current');};
  }, [query, open, noteKey, readerRef, supported]);
  useEffect(() => {
    if (!supported) return;
    const range = ranges[index];
    CSS.highlights.set('note-find-current', new Highlight(...(range ? [range] : [])));
    if (!range || !readerRef.current) return;
    const rect = range.getBoundingClientRect();
    const viewport = readerRef.current.getBoundingClientRect();
    readerRef.current.scrollTo({top: readerRef.current.scrollTop + rect.top - viewport.top - viewport.height / 3, behavior: 'auto'});
  }, [ranges, index, readerRef, supported]);
  function step(direction: number) {setIndex(value => ranges.length ? (value + direction + ranges.length) % ranges.length : 0);}

  return <>
    <button ref={triggerRef} className="workspace-icon" aria-label="Find in note" aria-expanded={open} onClick={() => setOpen(value => !value)}><Search size={17}/></button>
    {open && <div className="note-find-bar" role="search" aria-label="Find in current note" onKeyDown={event => {
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); close();}
      if (event.key === 'Enter') {event.preventDefault(); step(event.shiftKey ? -1 : 1);}
    }}>
      {supported ? <><input ref={inputRef} aria-label="Find text" placeholder="Find in note" value={query} onChange={event => setQuery(event.target.value)}/><output aria-live="polite">{query ? `${ranges.length ? index + 1 : 0} / ${ranges.length}` : '0 / 0'}</output><button className="workspace-icon" aria-label="Previous match" disabled={!ranges.length} onClick={() => step(-1)}><ChevronUp size={16}/></button><button className="workspace-icon" aria-label="Next match" disabled={!ranges.length} onClick={() => step(1)}><ChevronDown size={16}/></button></> : <span>Use your browser’s Find command.</span>}
      <button className="workspace-icon" aria-label="Close find" onClick={close}><X size={16}/></button>
    </div>}
  </>;
}
