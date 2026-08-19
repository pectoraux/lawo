'use client';

import { Eye, Brain, Database, Plug, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Plane {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const PLANES: Plane[] = [
  {
    id: 'experience',
    label: 'Experience Plane',
    description:
      'Consumer / business / enterprise clients — web, mobile, API, conversational UI. This UI lives here.',
    icon: <Eye className="size-4" />,
    color: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'intelligence',
    label: 'Intelligence Plane',
    description:
      'Context construction, state engine, rule engine, decision, optimization, agent runtime.',
    icon: <Brain className="size-4" />,
    color: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300',
  },
  {
    id: 'knowledge',
    label: 'Knowledge Plane',
    description:
      'Entity, fact, jurisdiction, authority, rule, procedure, place, evidence, temporal graphs.',
    icon: <Database className="size-4" />,
    color: 'border-teal-500/40 bg-teal-500/5 text-teal-700 dark:text-teal-300',
  },
  {
    id: 'execution',
    label: 'Execution Plane',
    description:
      'Government integrations, forms, filings, payments, notifications, document generation.',
    icon: <Plug className="size-4" />,
    color: 'border-violet-500/40 bg-violet-500/5 text-violet-700 dark:text-violet-300',
  },
  {
    id: 'foundation',
    label: 'Platform Foundation',
    description:
      'Multi-tenancy, identity, authorization, encryption, auditing, provenance, package registry.',
    icon: <Shield className="size-4" />,
    color: 'border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300',
  },
];

export function PlanesOverview() {
  return (
    <section aria-label="Architecture planes" className="mt-2">
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">The 5 Frozen Planes</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {PLANES.map((p) => (
          <Card key={p.id} className={cn('gap-2 py-3', p.color)}>
            <CardHeader className="px-3">
              <CardTitle className="flex items-center gap-1.5 text-xs">
                {p.icon}
                {p.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3">
              <CardDescription className="text-[10px] leading-snug">{p.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
