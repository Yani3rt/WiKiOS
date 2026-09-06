// @vitest-environment jsdom
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {createMemoryRouter, RouterProvider} from "react-router-dom";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {VaultSwitcher} from "../src/components/vault-switcher";
let root:Root, container:HTMLDivElement, router:ReturnType<typeof createMemoryRouter>;
let locked:boolean, fail:boolean;
const fetchMock=vi.fn();
beforeEach(async()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);locked=false;fail=false;
  fetchMock.mockReset().mockImplementation(async (_url:string, init?:RequestInit)=>new Response(JSON.stringify(init?.method === "POST" ? fail ? {error:"Folder disappeared"} : {ok:true} : {wikiRoot:"/vaults/Personal",hasEnvOverride:locked,recentVaults:[{name:"Personal",path:"/vaults/Personal",available:true},{name:"Work",path:"/vaults/Work",available:true},{name:"Archive",path:"/vaults/Archive",available:false}]}),{status:init?.method === "POST" && fail ? 400:200,headers:{"content-type":"application/json"}}));
  vi.stubGlobal("fetch",fetchMock);
  router=createMemoryRouter([{path:"/explorer",Component:VaultSwitcher},{path:"/",Component:()=> <p>New workspace</p>}],{initialEntries:["/explorer"]});
  container=document.createElement("div");document.body.append(container);root=createRoot(container);
  await act(async()=>root.render(<RouterProvider router={router}/>));
});
afterEach(async()=>{await act(async()=>root.unmount());router.dispose();container.remove();vi.unstubAllGlobals();});
async function open(){await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Switch vault"]')!.click());}
it("shows current and recent vaults and switches directly without visiting settings",async()=>{
  await open();expect(container.querySelector('.vault-current')?.textContent).toBe("Personal");
  expect(container.querySelectorAll('.vault-recent')).toHaveLength(2);
  expect(container.querySelectorAll<HTMLButtonElement>('.vault-recent')[1].disabled).toBe(true);
  await act(async()=>container.querySelector<HTMLButtonElement>('.vault-recent')!.click());
  expect(fetchMock).toHaveBeenCalledWith("/api/setup/config",expect.objectContaining({method:"POST",body:JSON.stringify({wikiRoot:"/vaults/Work"})}));
  expect(router.state.location.pathname).toBe("/");
});
it("respects session locks and keeps management available",async()=>{
  locked=true;await open();
  expect(container.querySelector<HTMLButtonElement>('.vault-recent')!.disabled).toBe(true);
  expect(container.querySelector('.vault-open-another')?.getAttribute('href')).toBe('/setup?change=1');
  expect(container.textContent).toContain("locked for this session");
});
it("keeps the dropdown and previous workspace when switching fails",async()=>{
  fail=true;await open();await act(async()=>container.querySelector<HTMLButtonElement>('.vault-recent')!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Folder disappeared");
  expect(router.state.location.pathname).toBe("/explorer");
  expect(container.querySelector<HTMLButtonElement>('.vault-recent')!.disabled).toBe(false);
});
it("dismisses on Escape and restores trigger focus without closing the parent",async()=>{
  await open();const parent=vi.fn();window.addEventListener("keydown",parent);
  await act(async()=>container.querySelector('.vault-recent')!.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
  expect(container.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(container.querySelector('button'));
  expect(parent).not.toHaveBeenCalled();window.removeEventListener("keydown",parent);
});
