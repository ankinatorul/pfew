import type { ReactNode } from "react";
import { ArrowUpRight, Sparkles, MapPin } from "lucide-react";
export function PfewPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pfew-page-header">
      <div>
        <span className="pfew-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <div className="pfew-page-description">{description}</div>
      </div>
      {actions && <div className="pfew-header-actions">{actions}</div>}
    </div>
  );
}
export function PfewSectionHeader({
  eyebrow,
  title,
  detail,
  actions,
}: {
  eyebrow?: string;
  title: string;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pfew-section-header">
      <div>
        {eyebrow && <span className="pfew-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {actions}
    </div>
  );
}
export function PfewStatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "planned" | "confirmed";
}) {
  return <span className={"pfew-status pfew-status-" + tone}>{children}</span>;
}
export function PfewEditorialCard({
  children,
  tone = "lavender",
  className = "",
}: {
  children: ReactNode;
  tone?: "lavender" | "lime" | "pink" | "cobalt";
  className?: string;
}) {
  return (
    <section className={`pfew-editorial pfew-tone-${tone} ${className}`}>
      {children}
    </section>
  );
}
export function PfewEmptyState({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="pfew-empty">
      <MapPin size={28} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
      {actions}
    </section>
  );
}
export function PfewInsightCard({
  title,
  children,
  action,
  footer,
}: {
  title: string;
  children: ReactNode;
  action: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <PfewEditorialCard tone="cobalt" className="pfew-insight">
      <div className="pfew-insight-icon">
        <Sparkles size={24} aria-hidden="true" />
      </div>
      <span className="pfew-eyebrow">A little peace of mind</span>
      <h2>{title}</h2>
      <div className="pfew-insight-copy">{children}</div>
      <div className="pfew-insight-action">
        {action}
        <ArrowUpRight size={18} aria-hidden="true" />
      </div>
      {footer && <p className="pfew-insight-footnote">{footer}</p>}
    </PfewEditorialCard>
  );
}
