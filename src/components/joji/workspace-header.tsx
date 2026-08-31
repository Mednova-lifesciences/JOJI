import type { ReactNode } from "react";

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-border px-5 py-8 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10">
      <div>
        <p className="label-mono text-teal">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}

export function MedicalDisclaimer() {
  return (
    <p className="label-mono flex items-center gap-2 text-muted-foreground">
      <span className="size-1.5 rounded-full bg-emerald" /> Estimate only. Consult your health
      worker.
    </p>
  );
}
