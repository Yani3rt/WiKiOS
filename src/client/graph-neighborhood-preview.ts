import type { GraphBounds } from './graph-camera';
import { getGraphPreviewPlacement } from './graph-neighborhood-preview-model';

export interface GraphPreviewContent {
  title: string;
  meta?: string;
  sections: {label?:string;items:{label:string;meta?:string;current?:boolean}[];remaining?:number}[];
}
interface PreviewBinding {trigger:HTMLElement;getContent():GraphPreviewContent;pointerFocused:boolean;}
let nextPreviewId=0;

/** A single, noninteractive description for the existing graph navigation controls. */
export function createGraphNeighborhoodPreview({container,canShow,getBounds,getObstacles}: {
  container:HTMLElement;
  canShow():boolean;
  getBounds():GraphBounds;
  getObstacles(trigger:HTMLElement):readonly GraphBounds[];
}) {
  const tooltip=document.createElement('div');
  tooltip.id=`graph-neighborhood-preview-${++nextPreviewId}`;
  tooltip.className='graph-neighborhood-preview';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;
  container.append(tooltip);
  let active:PreviewBinding|null=null;
  let anchor:GraphBounds|null=null;
  let previewBox:GraphBounds|null=null;
  let hovered:PreviewBinding|null=null;
  let focused:PreviewBinding|null=null;
  let overPreview=false;
  let openTimer:number|undefined,closeTimer:number|undefined;
  let destroyed=false;
  const bindings:PreviewBinding[]=[];
  const cleanups:(()=>void)[]=[];
  const listen=<K extends keyof HTMLElementEventMap>(element:HTMLElement,type:K,listener:(event:HTMLElementEventMap[K])=>void,capture=false)=>{
    element.addEventListener(type,listener,capture);
    cleanups.push(()=>element.removeEventListener(type,listener,capture));
  };
  const clearTimers=()=>{window.clearTimeout(openTimer);window.clearTimeout(closeTimer);openTimer=closeTimer=undefined;};
  const describe=(trigger:HTMLElement,show:boolean)=>{
    const ids=(trigger.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id=>id && id!==tooltip.id);
    if(show) ids.push(tooltip.id);
    if(ids.length) trigger.setAttribute('aria-describedby',ids.join(' '));else trigger.removeAttribute('aria-describedby');
  };
  const dismiss=()=>{
    clearTimers();if(active) describe(active.trigger,false);
    active=null;anchor=null;previewBox=null;hovered=null;focused=null;overPreview=false;tooltip.hidden=true;
  };
  const element=(tag:string,className:string,text?:string)=>{
    const node=document.createElement(tag);node.className=className;
    if(text!==undefined) node.textContent=text;
    return node;
  };
  const render=(content:GraphPreviewContent)=>{
    const header=element('div','graph-preview-header');header.append(element('strong','graph-preview-title',content.title));
    if(content.meta) header.append(element('span','graph-preview-meta',content.meta));
    tooltip.replaceChildren(header);
    for(const section of content.sections) {
      if(!section.items.length && !section.remaining) continue;
      const body=element('div','graph-preview-section');
      if(section.label) body.append(element('div','graph-preview-heading',section.label));
      const list=element('ul','graph-preview-list');
      for(const item of section.items) {
        const row=element('li','graph-preview-row');
        row.append(element('span','graph-preview-name',item.label));
        if(item.meta) row.append(element('span','graph-preview-meta',item.meta));
        if(item.current) {row.setAttribute('aria-current','true');row.append(element('span','graph-preview-current','Current'));}
        list.append(row);
      }
      body.append(list);
      if(section.remaining) body.append(element('div','graph-preview-more',`+${section.remaining} more`));
      tooltip.append(body);
    }
  };
  const valid=(binding:PreviewBinding)=>binding.trigger.isConnected && !binding.trigger.hidden && !binding.trigger.inert && binding.trigger.getBoundingClientRect().width>0;
  const show=()=>{
    openTimer=undefined;
    if(destroyed || !canShow() || !active || !valid(active)) {dismiss();return;}
    const bounds=getBounds();
    tooltip.style.width=`${Math.min(288,Math.max(0,bounds.right-bounds.left))}px`;
    tooltip.style.maxHeight=`${Math.max(0,bounds.bottom-bounds.top)}px`;
    render(active.getContent());
    tooltip.hidden=false;tooltip.style.visibility='hidden';
    const size=tooltip.getBoundingClientRect();
    const position=getGraphPreviewPlacement(active.trigger.getBoundingClientRect(),size,bounds,getObstacles(active.trigger));
    if(!position) {dismiss();return;}
    previewBox={left:position.x,top:position.y,right:position.x+size.width,bottom:position.y+size.height};
    const origin=container.getBoundingClientRect();
    tooltip.style.left=`${position.x-origin.left}px`;tooltip.style.top=`${position.y-origin.top}px`;
    tooltip.style.visibility='';describe(active.trigger,true);
  };
  const request=(binding:PreviewBinding,delay:number)=>{
    window.clearTimeout(closeTimer);closeTimer=undefined;
    if(destroyed) return;
    if(!canShow()) {dismiss();return;}
    if(active===binding) return;
    dismiss();active=binding;anchor=binding.trigger.getBoundingClientRect();
    if(delay===0) show();else openTimer=window.setTimeout(show,delay);
  };
  const leave=()=>{
    if(!active || hovered===active || focused===active || overPreview) return;
    if(tooltip.hidden) {dismiss();return;}
    window.clearTimeout(closeTimer);closeTimer=window.setTimeout(dismiss,120);
  };
  // Keep an obstacle-displaced preview reachable without an invisible hit target.
  listen(container,'pointermove',event=>{
    if(!anchor || !previewBox || tooltip.hidden || overPreview) return;
    const a=anchor,p=previewBox;
    const bridge=p.left>=a.right ? {left:a.right,right:p.left,top:Math.min(a.top,p.top),bottom:Math.max(a.bottom,p.bottom)}
      : p.right<=a.left ? {left:p.right,right:a.left,top:Math.min(a.top,p.top),bottom:Math.max(a.bottom,p.bottom)}
      : p.top>=a.bottom ? {left:Math.min(a.left,p.left),right:Math.max(a.right,p.right),top:a.bottom,bottom:p.top}
      : {left:Math.min(a.left,p.left),right:Math.max(a.right,p.right),top:p.bottom,bottom:a.top};
    if(event.clientX>=bridge.left && event.clientX<=bridge.right && event.clientY>=bridge.top && event.clientY<=bridge.bottom) leave();
  });
  listen(tooltip,'pointerenter',()=>{overPreview=true;window.clearTimeout(closeTimer);});
  listen(tooltip,'pointerleave',()=>{overPreview=false;leave();});
  listen(tooltip,'click',event=>event.stopPropagation());
  listen(tooltip,'wheel',event=>event.stopPropagation());
  listen(container,'pointerdown',event=>{
    const target=event.target;
    if(target instanceof Node && !tooltip.contains(target) && !bindings.some(binding=>binding.trigger.contains(target))) dismiss();
  },true);
  listen(container,'keydown',event=>{
    if(event.key!=='Escape' || !active) return;
    event.preventDefault();event.stopPropagation();dismiss();
  },true);
  return {
    attach(trigger:HTMLElement,getContent:()=>GraphPreviewContent) {
      const binding={trigger,getContent,pointerFocused:false};bindings.push(binding);
      listen(trigger,'pointerenter',event=>{if(event.pointerType==='touch') return;request(binding,250);hovered=binding;});
      listen(trigger,'pointerleave',()=>{if(hovered===binding) hovered=null;leave();});
      listen(trigger,'pointerdown',()=>{binding.pointerFocused=true;dismiss();});
      listen(trigger,'keydown',()=>{binding.pointerFocused=false;});
      listen(trigger,'focus',()=>{if(!binding.pointerFocused) {request(binding,0);focused=binding;}});
      listen(trigger,'blur',()=>{binding.pointerFocused=false;if(focused===binding) focused=null;leave();});
      listen(trigger,'click',dismiss,true);
    },
    refresh() {
      if(!active || !anchor) return;
      const box=active.trigger.getBoundingClientRect();
      if(!canShow() || !valid(active) || (['left','right','top','bottom'] as const).some(key=>Math.abs(box[key]-anchor![key])>.5)) {dismiss();return;}
      if(previewBox) {
        const bounds=getBounds(),p=previewBox;
        if(p.left<bounds.left || p.right>bounds.right || p.top<bounds.top || p.bottom>bounds.bottom ||
          getObstacles(active.trigger).some(other=>p.left<other.right+6 && p.right>other.left-6 && p.top<other.bottom+6 && p.bottom>other.top-6)) dismiss();
      }
    },
    dismiss,
    destroy() {if(destroyed) return;dismiss();destroyed=true;cleanups.forEach(cleanup=>cleanup());tooltip.remove();},
  };
}
