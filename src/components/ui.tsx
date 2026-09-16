'use client';
import {
  useEffect,
  useRef,
  useId,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react';
import { X, Leaf, ArrowRight, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { en } from '@/lib/i18n/en';
import { SolaceMark } from './solace-mark';

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`} role="img" aria-label={en.brand}>
      <span className="brand-mark" aria-hidden="true">
        <SolaceMark />
      </span>
      <span className="brand-wordmark" aria-hidden="true">
        {en.brand}
      </span>
    </div>
  );
}
export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function IconButton({
  children,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className="icon-button" title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [trigger] = useState(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const firstField =
      dialog?.querySelector<HTMLElement>('[data-autofocus]') ||
      dialog?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled)',
      );
    firstField?.focus();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [trigger]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className={`dialog ${wide ? 'wide' : ''}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id={headingId}>{title}</h2>
        <IconButton label={en.common.close} onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Leaf size={25} />
      </span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action && (
        <Button variant="secondary" onClick={onAction}>
          <Plus size={16} />
          {action}
        </Button>
      )}
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowRight size={15} />
    </button>
  );
}
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        skipHtml
        components={{ a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
export function FormActions({
  onClose,
  submit = en.common.save,
}: {
  onClose: () => void;
  submit?: string;
}) {
  return (
    <div className="form-actions">
      <Button type="button" variant="secondary" onClick={onClose}>
        {en.common.cancel}
      </Button>
      <Button type="submit">{submit}</Button>
    </div>
  );
}
export function ColorDot({ color }: { color?: string }) {
  return <span className="color-dot" style={{ backgroundColor: color || 'var(--muted)' }} />;
}
