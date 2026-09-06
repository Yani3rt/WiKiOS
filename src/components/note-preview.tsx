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

type Target = {slug:string; element:HTMLElement; touch:boolean; x:number; y:number};
type Preview = {slug:string; page?:WikiPageData; message?:string};
export function NotePreview({rootRef, onOpen, activeSlug}: {
  rootRef:RefObject<HTMLElement|null>; onOpen:(slug:string)=>void; activeSlug:string|null;
}) {
  const id=useId();
  const panel=useRef<HTMLDivElement>(null);
  const openRef=useRef(onOpen); openRef.current=onOpen;
  const [target,setTarget]=useState<Target|null>(null);
  const targetRef=useRef(target);targetRef.current=target;
  const [result,setResult]=useState<Preview|null>(null);
  const [retry,setRetry]=useState(0);
  const cache=useRef(new Map<string,{page:WikiPageData;expires:number}>());
  const suppressFocus=useRef(false);
  useEffect(()=>setTarget(null),[activeSlug]);
  useEffect(()=>{
    const root=rootRef.current;if (!root) return;
    let timer:ReturnType<typeof setTimeout>|undefined;
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
      const rect=found.element.getBoundingClientRect();
      setTarget({...found,touch,x:Math.max(12,Math.min(rect.left,innerWidth-352)),y:Math.max(12,Math.min(rect.bottom+8,innerHeight-320))});
    }
    const hover=(event:PointerEvent)=>{
      if (event.pointerType==='touch' || window.matchMedia('(hover: none)').matches) return;
      const found=resolve(event.target); if (!found || found.element.contains(event.relatedTarget as Node|null)) return;
      cancel();timer=setTimeout(()=>show(found,false),350);
    };
    const leave=(event:PointerEvent)=>{
      if (panel.current?.contains(event.relatedTarget as Node|null)) {cancel();return;}
      if (!resolve(event.target)) return;
      cancel();timer=setTimeout(()=>setTarget(null),180);
    };
    const focus=(event:FocusEvent)=>{
      if (suppressFocus.current) return;
      const found=resolve(event.target);if (!found) return;
      cancel();timer=setTimeout(()=>show(found,false),350);
    };
    const blur=(event:FocusEvent)=>{
      if (panel.current?.contains(event.relatedTarget as Node|null)) return;
      cancel(); if (resolve(event.target)) setTarget(null);
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
  if (!target) return null;
  const current=result?.slug===target.slug ? result:null;
  return <div ref={panel} id={id} role="dialog" aria-label="Note preview" className={`note-peek ${target.touch?'note-peek-touch':''}`} style={target.touch?undefined:{left:target.x,top:target.y,maxHeight:innerHeight-target.y-12}}
    onPointerLeave={event=>{if (!target.element.contains(event.relatedTarget as Node|null)) setTarget(null);}}
    onBlur={event=>{if (!event.currentTarget.contains(event.relatedTarget)) setTarget(null);}}>
    <header><span><FileText size={14}/>Note preview</span><button aria-label="Close note preview" onClick={()=>{setTarget(null);suppressFocus.current=true;target.element.focus({preventScroll:true});suppressFocus.current=false;}}><X size={16}/></button></header>
    {current?.page ? <><h2>{current.page.title}</h2><p className="note-peek-excerpt">{previewExcerpt(current.page.contentMarkdown)}</p>{current.page.modifiedAt>0 && <time dateTime={new Date(current.page.modifiedAt).toISOString()}>Updated {new Date(current.page.modifiedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time>}</> : <p role="status" className="note-peek-excerpt">{current?.message??'Loading preview…'} {current?.message==='Preview unavailable.' && <button onClick={()=>setRetry(value=>value+1)}>Retry</button>}</p>}
    <button className="note-peek-open" onClick={()=>{setTarget(null);openRef.current(target.slug);}}>Open in tab<ArrowUpRight size={15}/></button>
  </div>;
}
