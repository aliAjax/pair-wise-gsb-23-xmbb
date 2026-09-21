import type { ReactNode } from "react";

export function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted" | "info"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required ? <em className="field-required">*</em> : null}
      </span>
      {children}
      {hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

export const inputClass = "text-input";
export const selectClass = "text-input";
