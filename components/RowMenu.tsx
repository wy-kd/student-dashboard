'use client';
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { nextMenuIndex } from '@/lib/task-workspace';
export type RowAction = { label: string; run(): void; disabled?: boolean; destructive?: boolean };
export function RowMenu({
  name,
  actions,
  disabled = false,
}: {
  name: string;
  actions: RowAction[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="row-menu"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="icon-button row-menu-trigger"
        aria-label={'More actions for ' + name}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          className="row-menu-items"
          role="menu"
          aria-label={'Actions for ' + name}
          ref={menu}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              const items = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              ];
              items[
                nextMenuIndex(
                  e.key,
                  items.indexOf(document.activeElement as HTMLButtonElement),
                  items.length,
                )
              ]?.focus();
            }
          }}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={a.disabled}
              className={a.destructive ? 'danger-text' : ''}
              onClick={() => {
                close();
                a.run();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
