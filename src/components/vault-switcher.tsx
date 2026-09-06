import { Check, ChevronDown, Folder, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchJson } from "@/client/api";

interface VaultStatus {
  wikiRoot: string | null;
  hasEnvOverride: boolean;
  recentVaults: {name: string; path: string; available: boolean}[];
}

export function VaultSwitcher() {
  const navigate = useNavigate();
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetchJson<VaultStatus>("/api/setup/status", {signal:controller.signal})
      .then(data => {if (!controller.signal.aborted) {setStatus(data);setError(null);}})
      .catch(() => {if (!controller.signal.aborted) setError("Could not load your vaults.");});
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {document.removeEventListener("pointerdown", outside);document.removeEventListener("keydown", escape);};
  }, [open]);
  async function switchVault(path: string) {
    if (pending || status?.hasEnvOverride || path === status?.wikiRoot) return;
    setPending(path);setError(null);
    try {
      await fetchJson("/api/setup/config", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({wikiRoot:path})});
      setOpen(false);
      navigate("/", {replace:true});
    } catch (failure) {
      setError(failure instanceof Response ? await failure.text() : "Could not open that vault. Try again.");
    } finally {setPending(null);}
  }
  const currentName = status?.wikiRoot?.split(/[\\/]/).filter(Boolean).at(-1) ?? "My vault";
  const recent = status?.recentVaults.filter(vault => vault.path !== status.wikiRoot) ?? [];
  return <div className="vault-switcher" ref={wrapper}>
    <button ref={trigger} className="workspace-vault" aria-label="Switch vault" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} title={status?.wikiRoot ?? undefined} onClick={() => {setOpen(value => !value); if (!open) setRefresh(value => value + 1);}}>
      <span className="vault-dot"/><span className="vault-trigger-name">{currentName}</span><ChevronDown size={14}/>
    </button>
    {open && <div id={id} className="vault-switcher-popover" role="dialog" aria-label="Switch vault">
      {status?.wikiRoot && <div className="vault-current"><Folder size={16}/><span>{currentName}</span><Check size={15}/></div>}
      {status?.hasEnvOverride && <p className="vault-switcher-status">Vault switching is locked for this session.</p>}
      {!status && !error && <p className="vault-switcher-status" role="status">Loading vaults…</p>}
      {error && <div className="vault-switcher-status" role="alert">{error}{!status && <button onClick={() => setRefresh(value => value + 1)}>Retry</button>}</div>}
      {status && <div className="vault-recent-list">
        {recent.length === 0 ? <p className="vault-switcher-status">No other recent vaults</p> : recent.map(vault => <button key={vault.path} className="vault-recent" disabled={!!pending || status.hasEnvOverride || !vault.available} onClick={() => void switchVault(vault.path)} title={vault.path}>
          {pending === vault.path ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none"/> : <Folder size={16}/>}
          <span><strong>{vault.name}</strong><small>{vault.available ? vault.path : "Folder unavailable"}</small></span>
        </button>)}
      </div>}
      <Link to="/setup?change=1" className="vault-open-another" onClick={() => setOpen(false)}><Plus size={16}/>Open another vault</Link>
    </div>}
  </div>;
}
