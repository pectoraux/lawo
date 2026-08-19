'use client';

import { ShieldCheck } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Invariant {
  code: string;
  statement: string;
  detail: string;
  category: 'kernel' | 'temporal' | 'truth' | 'provenance' | 'tenant' | 'package' | 'process';
}

const INVARIANTS: Invariant[] = [
  {
    code: 'I1',
    statement: 'Core remains domain-agnostic.',
    detail:
      'The kernel cannot import vertical-specific modules or branch on a vertical predicate (no `if (insurance)`, no `InsuranceClaim` type). Adding a vertical must not require touching the kernel.',
    category: 'kernel',
  },
  {
    code: 'I2',
    statement: 'Country-specific logic lives in packages.',
    detail:
      'A country is a jurisdiction dimension, not the primary application boundary. Hard-coding a country collapses portability; adding a country never requires touching the kernel.',
    category: 'package',
  },
  {
    code: 'I3',
    statement: 'Vertical-specific logic lives in packages.',
    detail:
      'Verticals (insurance, customs, healthcare) must be addable without recompiling the kernel. Domain concepts compose primitives — they do not extend them.',
    category: 'package',
  },
  {
    code: 'I4',
    statement: 'Situation-specific logic lives in situation/procedure packages.',
    detail:
      'Situations (border crossing, traffic stop, hospital admission) must be addable without modifying the kernel. The kernel provides the state-machine primitive; situations encode their own states/transitions.',
    category: 'package',
  },
  {
    code: 'I5',
    statement: 'LLM output is never authoritative legal truth.',
    detail:
      'Authoritative answers must come from deterministic, inspectable machinery. LLMs may extract facts (T3), retrieve candidate rules, and generate explanations — but never decide which rule fires.',
    category: 'truth',
  },
  {
    code: 'I6',
    statement: 'Every material decision has provenance.',
    detail:
      'Every StateSnapshot carries `provenance: Provenance[]`. Without provenance the platform cannot answer "why did we produce this?" or "which version did we use?"',
    category: 'provenance',
  },
  {
    code: 'I7',
    statement: 'Every rule has temporal/version metadata.',
    detail:
      'Without temporal metadata the platform cannot support `evaluate(as_of = DATE)`. Historical truth must remain reconstructable; law is not retroactive.',
    category: 'temporal',
  },
  {
    code: 'I8',
    statement: 'Community observations cannot masquerade as authority.',
    detail:
      'Reports from the field (T4) carry different certainty than enacted law (T0). No `Rule` may carry `truthLevel: T4/T5`; combining truth levels always returns the weaker (higher-numbered) one.',
    category: 'truth',
  },
  {
    code: 'I9',
    statement: 'Private tenant data cannot enter global knowledge without explicit, authorized publication.',
    detail:
      'Tenant isolation is a security boundary. Every query carries a `tenantId`; promotion of tenant data to global is an explicit, audited `PUBLISH` action.',
    category: 'tenant',
  },
  {
    code: 'I10',
    statement: 'Packages are independently versioned and deployable.',
    detail:
      'Each `PackageManifest` carries its own `version` and `verificationMetadata`; deployments are package-scoped; rollback is per-package.',
    category: 'package',
  },
  {
    code: 'I11',
    statement: 'Packages cannot silently mutate kernel semantics.',
    detail:
      'A package that redefines `Rule`, `Fact`, or `Jurisdiction` effectively forks the platform. Packages compose primitives; they do not redefine them.',
    category: 'package',
  },
  {
    code: 'I12',
    statement: 'Extensions cannot bypass capability permissions.',
    detail:
      'Capabilities declare what they expose; extensions call into capabilities through the published surface. No back-channel access to kernel internals.',
    category: 'kernel',
  },
  {
    code: 'I13',
    statement: 'Historical decisions remain reproducible.',
    detail:
      'Same inputs + same package versions → identical state/provenance/audit. Historical truth is not retroactive; replaying a fixture at its original `as_of` yields byte-identical output.',
    category: 'temporal',
  },
  {
    code: 'I14',
    statement: 'Production changes must preserve backward-compatible contracts unless explicitly versioned.',
    detail:
      'Breaking changes require a versioned migration and supersession link; in-place mutation of a published artefact is forbidden.',
    category: 'process',
  },
  {
    code: 'I15',
    statement: 'Architecture is changed only through an Architecture Change Order.',
    detail:
      'The frozen planes, kernel primitives, contract surface, and invariants are changed only through an ACO. No silent redefinitions.',
    category: 'process',
  },
  {
    code: 'I16',
    statement: 'No feature may introduce a new architectural primitive merely because it makes one feature easier.',
    detail:
      'Each new primitive must earn its place across multiple verticals. Primitives are general; features are specific.',
    category: 'kernel',
  },
  {
    code: 'I17',
    statement: 'Repeated code across verticals is evidence to improve the kernel or create a shared capability.',
    detail:
      'Duplication is a smell. If two verticals need the same shape, lift it into the kernel or a shared capability — never copy-paste.',
    category: 'kernel',
  },
  {
    code: 'I18',
    statement: 'A hardening sprint may improve implementation but may not redefine architecture.',
    detail:
      'Hardening fixes bugs and improves performance. It does not change the frozen contract surface. Architecture changes go through an ACO.',
    category: 'process',
  },
];

const CATEGORY_COLOR: Record<Invariant['category'], string> = {
  kernel: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  temporal: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  truth: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  provenance: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
  tenant: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  package: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
  process: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
};

export function InvariantsReference() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-emerald-600" aria-hidden />
          Architecture Invariants (I1–I18)
        </CardTitle>
        <CardDescription className="text-xs">
          FROZEN binding constraints. Each is enforced by an architecture test in CI (section 34).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={[]} className="w-full">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {INVARIANTS.map((inv) => (
              <AccordionItem
                key={inv.code}
                value={inv.code}
                className="rounded-md border border-border bg-card px-2"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex w-full items-center gap-2 text-left">
                    <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      {inv.code}
                    </span>
                    <span className="text-xs font-medium leading-tight">{inv.statement}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'ml-auto px-1 py-0 text-[9px] uppercase tracking-wider',
                        CATEGORY_COLOR[inv.category],
                      )}
                    >
                      {inv.category}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-[11px] leading-snug text-muted-foreground">{inv.detail}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </div>
        </Accordion>
      </CardContent>
    </Card>
  );
}
