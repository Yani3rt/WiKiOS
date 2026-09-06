import { BookOpen, Clock3, Maximize2, Minimize2, MoreHorizontal, Network, PanelRight, Pin, Search, X } from "lucide-react";
import { useRef, type RefObject } from "react";
import { Link } from "react-router-dom";

interface MobileWorkspaceNavProps {
  view: "notes" | "activity";
  sidebarOpen: boolean;
  inert: boolean;
  hasNote: boolean;
  noteReady: boolean;
  pinned: boolean;
  focusMode: boolean;
  notesRef: RefObject<HTMLButtonElement | null>;
  moreRef: RefObject<HTMLButtonElement | null>;
  onNotes: () => void;
  onSearch: () => void;
  onActivity: () => void;
  onPin: () => void;
  onConnections: () => void;
  onFocus: () => void;
}

export function MobileWorkspaceNav(props: MobileWorkspaceNavProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const runAction = (action: () => void) => {
    dialogRef.current?.close();
    action();
  };

  return (
    <>
      <nav className="workspace-bottom-nav" aria-label="Mobile navigation" inert={props.inert}>
        {props.focusMode ? (
          <button className="workspace-exit-focus" onClick={props.onFocus} aria-label="Exit focus mode"><Minimize2 size={20} /><span>Exit focus</span></button>
        ) : <>
          <button ref={props.notesRef} aria-label="Notes: toggle note tree" aria-controls="explorer-sidebar" aria-expanded={props.sidebarOpen} aria-current={props.view === "notes" ? "page" : undefined} onClick={props.onNotes}><BookOpen size={21} /><span>Notes</span></button>
          <button aria-label="Open search palette" aria-haspopup="dialog" onClick={props.onSearch}><Search size={21} /><span>Search</span></button>
          <Link to="/graph"><Network size={21} /><span>Graph</span></Link>
          <button aria-current={props.view === "activity" ? "page" : undefined} onClick={props.onActivity}><Clock3 size={21} /><span>Activity</span></button>
          {props.hasNote && props.view === "notes" && <button ref={props.moreRef} aria-label="More note actions" aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()}><MoreHorizontal size={21} /><span>More</span></button>}
        </>}
      </nav>
      <dialog ref={dialogRef} className="workspace-actions-sheet" aria-label="Note actions" onClick={event => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientY < bounds.top || event.clientX < bounds.left || event.clientX > bounds.right) event.currentTarget.close();
        }
      }}>
        <header><h2>Note actions</h2><button aria-label="Close note actions" onClick={() => dialogRef.current?.close()}><X size={20}/></button></header>
        <button onClick={() => runAction(props.onPin)} aria-pressed={props.pinned}><Pin size={20}/>{props.pinned ? "Unpin note" : "Pin note"}</button>
        {props.noteReady && <>
          <button onClick={() => runAction(props.onConnections)}><PanelRight size={20}/>Connections</button>
          <button onClick={() => runAction(props.onFocus)}><Maximize2 size={20}/>Focus mode</button>
        </>}
      </dialog>
    </>
  );
}
