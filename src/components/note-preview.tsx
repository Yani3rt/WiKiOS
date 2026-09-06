import {ArrowUpRight, FileText, X} from "lucide-react";
import {useEffect, useId, useRef, useState, type RefObject} from "react";
import {fetchWikiPage} from "@/client/api";
import {encodeWikiSlugSegments} from "@/client/wiki-slug-encoding";
import type {WikiPageData} from "@/lib/wiki-shared";

export function previewExcerpt(markdown: string) {
  return markdown.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "")
    .split(/\n\s*\n/).map(block => block.replace(/^#{1,6} .*$/gm, "").trim())
    .find(Boolean)?.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ").trim().slice(0, 320) || "No text to preview.";
}

const PREVIEW_DWELL_MS = 750;
const PREVIEW_SWITCH_MS = 150;

type Target = {slug:string; element:HTMLElement; touch:boolean; x:number; y:number};
type Preview = {slug:string; page?:WikiPageData; message?:string};
export function NotePreview({rootRef, onOpen, activeSlug}: {
  rootRef:RefObject<HTMLElement|null>; onOpen:(slug:string)=>void; activeSlug:string|null;
}) {
  const id=useId();
  const panel=useRef<HTMLDivElement>(null);
  const openRef=useRef(onOpen); openRef.current=onOpen;
  const [target,setTarget]=useState<Target|null>(null);
  const [retainedTarget,setRetainedTarget]=useState<Target|null>(null);
  // Retain only the visual shell while exiting; interactions and requests end immediately.
  useEffect(()=>{
    if (target) {setRetainedTarget(target);return;}
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {setRetainedTarget(null);return;}
    const timeout=setTimeout(()=>setRetainedTarget(null),140);
    return ()=>clearTimeout(timeout);
  },[target]);
  const targetRef=useRef(target);targetRef.current=target;
  const [result,setResult]=useState<Preview|null>(null);
  const [retry,setRetry]=useState(0);
  const cache=useRef(new Map<string,{page:WikiPageData;expires:number}>());
  const suppressFocus=useRef(false);
  useEffect(()=>setTarget(null),[activeSlug]);
  useEffect(()=>{
    const root=rootRef.current;if (!root) return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let pendingFocus:HTMLElement|null=null;
    const cancel=()=>clearTimeout(timer);
    function resolve(node:EventTarget|null): {element:HTMLElement;slug:string}|null {
      if (!(node instanceof Element)) return null;
      const element=node.closest<HTMLElement>('[data-note-slug], a[href^="/wiki/"]');
      if (!element || !root!.contains(element) || element.closest('[inert]') || element instanceof HTMLButtonElement && element.disabled) return null;
      let slug=element.dataset.noteSlug;
      if (!slug) {
        const url=new URL((element as HTMLAnchorElement).href,window.location.origin);
        try {slug=url.pathname.slice(6).split('/').map(decodeURIComponent).join('/');} catch {return null;}
      }
      return slug && slug!==activeSlug ? {element,slug}:null;
    }
    function show(found:{element:HTMLElement;slug:string},touch:boolean) {
      pendingFocus=null;
      const rect=found.element.getBoundingClientRect();
      const drawer=found.element.closest('#explorer-sidebar')?.getBoundingClientRect();
      const besideDrawer=drawer && drawer.right+352<=innerWidth;
      setTarget({...found,touch,x:Math.max(12,Math.min(besideDrawer?drawer.right+8:rect.left,innerWidth-352)),y:Math.max(12,Math.min(besideDrawer?rect.top+rect.height/2-160:rect.bottom+8,innerHeight-320))});
    }
    const hover=(event:PointerEvent)=>{
      if (panel.current?.contains(event.target as Node)) {if (!pendingFocus) cancel();return;}
      if (event.pointerType==='touch' || window.matchMedia('(hover: none)').matches) return;
      const found=resolve(event.target); if (!found || found.element.contains(event.relatedTarget as Node|null)) return;
      if (pendingFocus && pendingFocus!==found.element && targetRef.current?.element===found.element) return;
      pendingFocus=null;
      cancel();
      if (targetRef.current?.element===found.element) return;
      timer=setTimeout(()=>show(found,false),targetRef.current?PREVIEW_SWITCH_MS:PREVIEW_DWELL_MS);
    };
    const leave=(event:PointerEvent)=>{
      if (pendingFocus===document.activeElement) return;
      if (panel.current?.contains(event.relatedTarget as Node|null)) {cancel();return;}
      const found=resolve(event.target);
      // pointerout bubbles between the icon, label and row: only a real row exit counts.
      if (found?.element.contains(event.relatedTarget as Node|null)) return;
      if (!found && !panel.current?.contains(event.target as Node)) return;
      cancel();timer=setTimeout(()=>setTarget(null),180);
    };
    const focus=(event:FocusEvent)=>{
      if (suppressFocus.current) return;
      const found=resolve(event.target);if (!found) return;
      pendingFocus=found.element;
      cancel();
      if (targetRef.current?.element===found.element) return;
      timer=setTimeout(()=>show(found,false),targetRef.current?PREVIEW_SWITCH_MS:PREVIEW_DWELL_MS);
    };
    const blur=(event:FocusEvent)=>{
      pendingFocus=null;
      if (panel.current?.contains(event.relatedTarget as Node|null) || resolve(event.relatedTarget)) {cancel();return;}
      cancel(); if (resolve(event.target) || panel.current?.contains(event.target as Node)) setTarget(null);
    };
    const click=(event:MouseEvent)=>{
      const found=resolve(event.target);if (!found || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button!==0) return;
      cancel();
      if (window.matchMedia('(hover: none)').matches) {event.preventDefault();event.stopPropagation();show(found,true);} else setTarget(null);
    };
    const outside=(event:PointerEvent)=>{if (targetRef.current && !panel.current?.contains(event.target as Node) && !targetRef.current.element.contains(event.target as Node)) {cancel();setTarget(null);}};
    const keyboard=(event:KeyboardEvent)=>{
      if (!targetRef.current) return;
      if (event.key==='Escape') {
        event.preventDefault();event.stopPropagation();cancel();
        const element=targetRef.current.element;setTarget(null);suppressFocus.current=true;element.focus({preventScroll:true});suppressFocus.current=false;
      } else if (event.key==='Tab' && !event.shiftKey && targetRef.current.element.contains(event.target as Node)) {
        event.preventDefault();panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    const scroll=()=>{cancel();setTarget(null);};
    root.addEventListener('pointerover',hover);root.addEventListener('pointerout',leave);
    root.addEventListener('focusin',focus);root.addEventListener('focusout',blur);root.addEventListener('click',click,true);
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keyboard,true);
    window.addEventListener('resize',scroll);
    return ()=>{cancel();root.removeEventListener('pointerover',hover);root.removeEventListener('pointerout',leave);root.removeEventListener('focusin',focus);root.removeEventListener('focusout',blur);root.removeEventListener('click',click,true);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keyboard,true);window.removeEventListener('resize',scroll);};
  },[rootRef,activeSlug]);
  useEffect(()=>{
    if (!target) return;
    const controller=new AbortController();const {slug}=target;
    target.element.setAttribute('aria-describedby',id);
    const cached=cache.current.get(slug);
    if (cached && cached.expires>Date.now()) setResult({slug,page:cached.page});
    else void fetchWikiPage(`/api/wiki/${encodeWikiSlugSegments(slug,2)}`,{signal:controller.signal}).then(response=>{
      if (controller.signal.aborted) return;
      if (response.status==='ambiguous') {setResult({slug,message:'Several notes match this link. Open it to choose.'});return;}
      if (cache.current.size>=20) cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(slug,{page:response.page,expires:Date.now()+30_000});setResult({slug,page:response.page});
    }).catch(()=>{if (!controller.signal.aborted) setResult({slug,message:'Preview unavailable.'});});
    return ()=>{controller.abort();target.element.removeAttribute('aria-describedby');};
  },[target,id,retry]);
  useEffect(()=>{if (target?.touch) panel.current?.querySelector<HTMLButtonElement>('button')?.focus();},[target]);
  const visibleTarget=target??retainedTarget;
  const current=result?.slug===visibleTarget?.slug ? result:null;
  const previousContent=useRef<Preview|null>(null);
  const [outgoing,setOutgoing]=useState<Preview|null>(null);
  useEffect(()=>{
    setOutgoing(window.matchMedia('(prefers-reduced-motion: reduce)').matches?null:previousContent.current);
    previousContent.current=current;
    const timeout=setTimeout(()=>setOutgoing(null),160);
    return ()=>clearTimeout(timeout);
  },[current]);
  if (!visibleTarget) return null;
  const exiting=!target;
  return <div ref={panel} id={exiting?undefined:id} role={exiting?undefined:"dialog"} aria-hidden={exiting || undefined} inert={exiting} aria-label="Note preview" className={`note-peek ${visibleTarget.touch?'note-peek-touch':''} ${exiting?'note-peek-exiting':''}`} style={visibleTarget.touch?undefined:{left:0,top:0,translate:`${visibleTarget.x}px ${visibleTarget.y}px`,maxHeight:innerHeight-visibleTarget.y-12}}>
    <header><span><FileText size={14}/>Note preview</span><button aria-label="Close note preview" onClick={()=>{setTarget(null);suppressFocus.current=true;visibleTarget.element.focus({preventScroll:true});suppressFocus.current=false;}}><X size={16}/></button></header>
    <div className="note-peek-content">
      {outgoing && <div className="note-peek-content-out" aria-hidden="true" inert><PreviewText preview={outgoing}/></div>}
      <div className="note-peek-content-in" key={`${visibleTarget.slug}:${current?.page?'ready':current?.message??'loading'}`}><PreviewText preview={current} onRetry={()=>setRetry(value=>value+1)}/></div>
    </div>
    <button className="note-peek-open" onClick={()=>{setTarget(null);openRef.current(visibleTarget.slug);}}>Open in tab<ArrowUpRight size={15}/></button>
  </div>;
}

function PreviewText({preview,onRetry}: {preview:Preview|null;onRetry?:()=>void}) {
  return <>{preview?.page ? <><h2>{preview.page.title}</h2><p className="note-peek-excerpt">{previewExcerpt(preview.page.contentMarkdown)}</p>{preview.page.modifiedAt>0 && <time dateTime={new Date(preview.page.modifiedAt).toISOString()}>Updated {new Date(preview.page.modifiedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time>}</> : <p role="status" className="note-peek-excerpt">{preview?.message??'Loading preview…'} {preview?.message==='Preview unavailable.' && <button onClick={()=>onRetry?.()}>Retry</button>}</p>}</>;
}
