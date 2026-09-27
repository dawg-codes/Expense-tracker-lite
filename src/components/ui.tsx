import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { animate } from 'motion';
import { inr } from '../lib/parser';
import { useBackHandler } from './nav';

const ICONS = {
  sync: <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v5M12 16.5v.5" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-5M12 8v.5" />
    </>
  ),
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4-2v-4z" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  left: <path d="M15 18l-6-6 6-6" />,
  right: <path d="M9 18l6-6-6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  upload: <path d="M12 21V9M7 14l5-5 5 5M4 3h16" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  undo: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  repeat: <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />,
  sort: <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      shown.current = value;
      if (ref.current) ref.current.textContent = inr(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v;
        if (ref.current) ref.current.textContent = inr(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span ref={ref} className={className}>
      {inr(value)}
    </span>
  );
}

/** Bottom sheet dialog. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  // Android Back / Escape closes the sheet (see nav.ts)
  useBackHandler(open, onClose);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sheet-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="sheet-head">
              <span className="sheet-grip" aria-hidden="true" />
              <h2>{title}</h2>
              <button className="icon-btn small" onClick={onClose} aria-label="Close">
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="sheet-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Empty({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <motion.div className="card empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="empty-emoji">{emoji}</div>
      <h2>{title}</h2>
      {children && <div className="muted empty-body">{children}</div>}
    </motion.div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <motion.span className="toggle-knob" layout transition={{ type: 'spring', stiffness: 600, damping: 36 }} />
    </button>
  );
}

/** Horizontal bar with a fill, used for categories and budgets. */
export function Bar({ pct, color, reduce, over }: { pct: number; color: string; reduce: boolean; over?: boolean }) {
  return (
    <div className="bar">
      <motion.div
        className="bar-fill"
        style={{ background: over ? 'var(--danger)' : color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const longDate = (ms: number) =>
  new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
