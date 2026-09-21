import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function FloatingMenu({
  trigger,
  children,
  className,
  label,
  width = 210,
}: {
  trigger: ReactNode;
  children: ReactNode;
  className: string;
  label: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const reducedMotion = useReducedMotion();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const anchor = button.current?.getBoundingClientRect();
    if (!anchor) return;
    const menuHeight = menu.current?.offsetHeight ?? 230;
    const top =
      anchor.bottom + menuHeight + 12 > window.innerHeight && anchor.top > menuHeight + 12
        ? anchor.top - menuHeight - 8
        : anchor.bottom + 8;
    setPosition({
      top: Math.max(8, top),
      left: Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8)),
    });
  }, [width]);

  useEffect(() => {
    if (!open) return;
    place();
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (
        !button.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={className === 'create-popover' ? 'primary create-trigger' : 'icon-button'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menu}
              className={`floating-menu ${className}`}
              role="menu"
              aria-label={label}
              style={{
                position: 'fixed',
                width: `min(${width}px, calc(100vw - 16px))`,
                ...position,
              }}
              initial={{ opacity: 0, y: -5, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: reducedMotion ? 0 : 0.14, ease: 'easeOut' }}
              onLayoutAnimationComplete={place}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                const items = Array.from(
                  menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
                );
                const index = items.indexOf(document.activeElement as HTMLElement);
                items[
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                ]?.focus();
                event.preventDefault();
              }}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('button, a')) setOpen(false);
              }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
