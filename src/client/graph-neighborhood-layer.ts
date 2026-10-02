import type { GraphBounds, GraphPoint } from './graph-camera';
import { createGraphNeighborhoodPreview } from './graph-neighborhood-preview';
import { limitGraphPreviewItems, type GraphNeighborhoodPreview } from './graph-neighborhood-preview-model';
import type { GraphNeighborhood } from './graph-neighborhoods';
import type { getGraphNavigationGeometry } from './graph-disclosure';

interface NeighborhoodRenderer {
  getDimensions(): {width:number;height:number};
  graphToViewport(point: GraphPoint): GraphPoint;
  on(event:'afterRender', callback:()=>void): unknown;
  off(event:'afterRender', callback:()=>void): unknown;
}
const overlaps = (a:GraphBounds,b:GraphBounds) => a.left < b.right+6 && a.right > b.left-6 && a.top < b.bottom+6 && a.bottom > b.top-6;
const inside = (box:GraphBounds,bounds:GraphBounds) => box.left>=bounds.left && box.right<=bounds.right && box.top>=bounds.top && box.bottom<=bounds.bottom;

/** Shared fixed-size control bounds for layer placement and full-memory framing. */
export const getGraphMemoryHubBounds=(center:GraphPoint):GraphBounds=>({left:center.x-64,right:center.x+64,top:center.y-18,bottom:center.y+54});

/** Navigation only: these controls never become notes, graph edges or search results. */
export function createGraphNeighborhoodLayer({container,sigma,groups,previews,getGeometry,onSelect,onMemory,getState}: {
  container:HTMLElement;
  sigma:NeighborhoodRenderer;
  groups:readonly GraphNeighborhood[];
  previews:ReadonlyMap<string,GraphNeighborhoodPreview>;
  getGeometry():ReturnType<typeof getGraphNavigationGeometry>;
  onSelect(group:GraphNeighborhood):void;
  onMemory():void;
  getState():{overview:boolean;anchorOpacity:number;hubCentered:boolean;memoryAction:'show-all'|'show-neighborhoods';moving:boolean;currentNeighborhood:string|null;opacity:number;bounds:GraphBounds;obstacles:GraphBounds[];color:string;anchorColor(id:string):string};
}) {
  const root=document.createElement('div');root.className='graph-neighborhood-layer';
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');root.append(canvas);
  const context=canvas.getContext('2d');
  const hub=document.createElement('button');hub.type='button';hub.className='graph-memory-hub';
  hub.innerHTML='<span class="graph-memory-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>My Memory</span>';
  hub.addEventListener('click',onMemory);hub.hidden=true;root.append(hub);
  const buttons=groups.map(group=>{
    const button=document.createElement('button');button.type='button';button.className='graph-neighborhood-anchor';
    const core=document.createElement('span');core.className='graph-anchor-core';core.setAttribute('aria-hidden','true');
    const row=document.createElement('span');row.className='graph-anchor-caption';
    const label=document.createElement('span');label.className='graph-anchor-name';label.textContent=group.label;
    const count=document.createElement('span');count.className='graph-anchor-count';count.textContent=String(group.members.length);
    row.append(label,count);button.append(core,row);
    button.setAttribute('aria-label',`Explore ${group.label} neighborhood, ${group.members.length} notes`);
    button.addEventListener('click',()=>onSelect(group));button.hidden=true;root.append(button);return button;
  });
  container.append(root);
  let geometry:ReturnType<typeof getGraphNavigationGeometry> | null=null;
  let titleBounds:GraphBounds[]=[];
  let obstructedAnchors=false;
  let destroyed=false;
  let previousMemoryAction:ReturnType<typeof getState>['memoryAction']|null=null;
  let canvasWidth=0,canvasHeight=0,pixelRatio=0;
  const preview=createGraphNeighborhoodPreview({
    container,canShow:()=>!getState().moving,getBounds:()=>getState().bounds,
    getObstacles:trigger=>[...getState().obstacles,...[hub,...buttons].filter(button=>button!==trigger && !button.hidden).map(button=>button.getBoundingClientRect())],
  });
  preview.attach(hub,()=>{
    const current=getState().currentNeighborhood;
    const directory=limitGraphPreviewItems([...previews.values()],current);
    return {title:'My Memory',meta:`${previews.size} ${previews.size===1?'neighborhood':'neighborhoods'}`,sections:[{
      items:directory.items.map(item=>({label:item.title,meta:`${item.noteCount} ${item.noteCount===1?'note':'notes'}`,current:item.id===current})),remaining:directory.remaining,
    }]};
  });
  groups.forEach((group,index)=>preview.attach(buttons[index],()=>{
    const item=previews.get(group.id)!;
    const linked=limitGraphPreviewItems(item.connections);
    return {title:item.title,meta:`${item.noteCount} ${item.noteCount===1?'note':'notes'}`,sections:[
      {label:'Most connected',items:item.notes.map(note=>({label:note.title}))},
      {label:'Linked neighborhoods',items:linked.items.map(link=>({label:link.label,meta:`${link.count} ${link.count===1?'link':'links'}`})),remaining:linked.remaining},
    ]};
  }));
  const place=(button:HTMLButtonElement,box:GraphBounds,opacity:number)=>{
    button.hidden=false;
    button.style.transform=`translate(${box.left}px, ${box.top}px)`;
    button.style.width=`${box.right-box.left}px`;
    button.style.opacity=String(opacity);
    titleBounds.push(box);
  };
  const refresh=()=>{
    if(destroyed) return;
    const state=getState();const {width,height}=sigma.getDimensions();
    hub.setAttribute('aria-label',state.memoryAction==='show-all'?'Show all notes':'Show neighborhoods');
    if(previousMemoryAction!==null && previousMemoryAction!==state.memoryAction) hub.classList.add('has-mode-transition');
    hub.classList.toggle('is-expanded',state.memoryAction==='show-neighborhoods');
    previousMemoryAction=state.memoryAction;
    const dpr=Math.min(2,window.devicePixelRatio || 1);
    if(width!==canvasWidth || height!==canvasHeight || dpr!==pixelRatio) {
      canvasWidth=width;canvasHeight=height;pixelRatio=dpr;
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
    }
    context?.setTransform(dpr,0,0,dpr,0,0);context?.clearRect(0,0,width,height);
    titleBounds=[];obstructedAnchors=false;
    if(state.opacity<=.02 || !groups.length) {hub.hidden=true;buttons.forEach(button=>{button.hidden=true;});preview.dismiss();return;}
    geometry ??= getGeometry();
    const center=sigma.graphToViewport({x:0,y:0});
    const centerBox=getGraphMemoryHubBounds(center);
    const docked=!state.hubCentered || !inside(centerBox,state.bounds) || state.obstacles.some(box=>overlaps(centerBox,box));
    hub.classList.toggle('is-docked',docked);
    const hubBox=docked
      ? {left:state.bounds.left+8,right:state.bounds.left+152,top:state.bounds.top+2,bottom:state.bounds.top+42}
      : centerBox;
    if(!inside(hubBox,state.bounds) || state.obstacles.some(box=>overlaps(hubBox,box))) hub.hidden=true;
    else place(hub,hubBox,state.opacity);
    const placementBounds=[...titleBounds];
    groups.forEach((group,index)=>{
      const button=buttons[index];
      const anchor=geometry!.anchors.find(point=>point.id===group.id);
      // Exit with the notes, but retire the hit target immediately. Both fades
      // use the route's disclosure clock, so rapid navigation stays reversible.
      button.inert=!state.overview;
      if(state.overview) button.removeAttribute('aria-hidden');else button.setAttribute('aria-hidden','true');
      const opacity=state.opacity*state.anchorOpacity;
      if(!anchor) {obstructedAnchors=true;button.hidden=true;return;}
      const point=sigma.graphToViewport(anchor);
      const buttonWidth=Math.min(180,Math.max(72,group.label.length*7+String(group.members.length).length*7+22));
      const box={left:point.x-buttonWidth/2,right:point.x+buttonWidth/2,top:point.y-18,bottom:point.y+48};
      if(!inside(box,state.bounds) || [...state.obstacles,...placementBounds].some(other=>overlaps(box,other))) {obstructedAnchors=true;button.hidden=true;return;}
      // Opacity is not a layout obstruction: fitting must work before entry fades
      // start, without moving an already suitable camera just to reveal controls.
      placementBounds.push(box);
      if(opacity<=.002) {button.hidden=true;return;}
      button.style.setProperty('--neighborhood-color',state.anchorColor(group.id));
      place(button,box,opacity);
      if(context && !docked) {
        context.save();context.beginPath();context.rect(state.bounds.left,state.bounds.top,state.bounds.right-state.bounds.left,state.bounds.bottom-state.bounds.top);context.clip();
        context.beginPath();context.setLineDash([1,7]);context.lineCap='round';
        context.moveTo(center.x,center.y);
        context.lineTo(center.x+(point.x-center.x)*opacity,center.y+(point.y-center.y)*opacity);
        context.strokeStyle=state.color;context.globalAlpha=opacity*.24;context.lineWidth=1;context.stroke();context.restore();
      }
    });
    preview.refresh();
  };
  sigma.on('afterRender',refresh);
  return {
    refresh,
    dismissPreview:preview.dismiss,
    invalidate(){geometry=null;refresh();},
    getTitleBounds:()=>titleBounds,
    hasObstructedAnchors:()=>obstructedAnchors,
    destroy(){if(destroyed)return;destroyed=true;sigma.off('afterRender',refresh);preview.destroy();root.remove();titleBounds=[];geometry=null;},
  };
}
