import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

interface SidebarDividerProps {
  expanded: boolean;
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize(width: number): void;
  onToggle(): void;
}

export function SidebarDivider({ expanded, width, minWidth, maxWidth, onResize, onToggle }: SidebarDividerProps) {
  const drag = useRef<{ pointerId: number; x: number; width: number; expanded: boolean; moved: boolean } | null>(null);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    if (!resizing) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [resizing]);

  const finishResize = (element: HTMLElement, pointerId: number) => {
    if (drag.current?.pointerId !== pointerId) return;
    drag.current = null;
    setResizing(false);
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  };

  const endPointer = (event: PointerEvent<HTMLDivElement>) => finishResize(event.currentTarget, event.pointerId);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Escape" && drag.current) {
      event.preventDefault();
      finishResize(event.currentTarget, drag.current.pointerId);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) onToggle();
      return;
    }
    const next = event.key === "ArrowLeft" ? width - 20
      : event.key === "ArrowRight" ? width + 20
      : event.key === "Home" ? minWidth
      : event.key === "End" ? maxWidth : null;
    if (next === null) return;
    event.preventDefault();
    onResize(next);
  };

  return (
    <div className="workspace-sidebar-divider" data-resizing={resizing} data-resize-start-expanded={drag.current?.expanded}>
      <div
        className="workspace-sidebar-resize"
        role="separator"
        tabIndex={0}
        aria-label="Resize navigation"
        aria-orientation="vertical"
        aria-controls="explorer-sidebar"
        aria-valuemin={expanded ? minWidth : 56}
        aria-valuemax={maxWidth}
        aria-valuenow={expanded ? width : 56}
        aria-valuetext={`${expanded ? width : 56} pixels`}
        onKeyDown={handleKeyDown}
        onPointerDown={event => {
          if (event.button !== 0 || drag.current) return;
          event.preventDefault();
          event.currentTarget.blur();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, x: event.clientX, width: expanded ? width : 56, expanded, moved: false };
          setResizing(true);
        }}
        onPointerMove={event => {
          const start = drag.current;
          if (!start || start.pointerId !== event.pointerId || (!start.moved && Math.abs(event.clientX - start.x) < 4)) return;
          start.moved = true;
          const nextWidth = start.width + event.clientX - start.x;
          if (start.expanded && expanded && nextWidth < minWidth / 2) {
            finishResize(event.currentTarget, event.pointerId);
            onResize(minWidth);
            onToggle();
            return;
          }
          onResize(nextWidth);
        }}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
      />
      <button className="workspace-divider-toggle" aria-label="Toggle sidebar" aria-expanded={expanded} aria-controls="explorer-sidebar" aria-keyshortcuts="Meta+Shift+s" onClick={onToggle}>
        {expanded ? <ChevronLeft size={14} aria-hidden/> : <ChevronRight size={14} aria-hidden/>}
      </button>
    </div>
  );
}
