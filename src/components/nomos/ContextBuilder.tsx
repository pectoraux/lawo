'use client';

import { useMemo } from 'react';
import { Plus, Trash2, Play, Loader2, CalendarDays, User, Globe, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TruthBadge } from './TruthBadge';
import { useNomosStore } from '@/lib/nomos-store';
import type { Fact, JurisdictionKind } from '@/kernel/primitives/types';
import { cn } from '@/lib/utils';

const JUR_KIND_COLOR: Record<JurisdictionKind, string> = {
  COUNTRY: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  REGION: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  STATE: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  MUNICIPALITY: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
  REGULATOR: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
  COURT: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  SPECIAL_ZONE: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  FREE_ZONE: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  SUPRANATIONAL: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  BILATERAL: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  INTERNATIONAL: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
};

function parseValueInput(v: string): unknown {
  // Try number first
  if (v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function valueToInput(v: unknown): string {
  if (typeof v === 'string') return v;
  return String(v);
}

function FactRow({ fact }: { fact: Fact }) {
  const updateFact = useNomosStore((s) => s.updateFact);
  const updateFactValue = useNomosStore((s) => s.updateFactValue);
  const removeFact = useNomosStore((s) => s.removeFact);

  const isBool = typeof fact.value === 'boolean';
  const isNum = typeof fact.value === 'number';

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-2">
      <div className="flex items-center gap-1.5">
        <Input
          aria-label={`Fact ${fact.id} attribute`}
          value={fact.attribute}
          onChange={(e) => updateFact(fact.id, { attribute: e.target.value })}
          className="h-7 flex-1 font-mono text-xs"
          placeholder="attribute"
        />
        <TruthBadge level={fact.truthLevel} size="sm" />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-rose-600 hover:bg-rose-500/10"
          aria-label={`Remove fact ${fact.id}`}
          onClick={() => removeFact(fact.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">value</span>
        {isBool ? (
          <Switch
            checked={fact.value === true}
            onCheckedChange={(v) => updateFactValue(fact.id, v)}
            aria-label={`Fact ${fact.id} value`}
          />
        ) : (
          <Input
            aria-label={`Fact ${fact.id} value`}
            value={valueToInput(fact.value)}
            type={isNum ? 'number' : 'text'}
            onChange={(e) => updateFactValue(fact.id, parseValueInput(e.target.value))}
            className="h-7 flex-1 font-mono text-xs"
            placeholder="value"
          />
        )}
        <span className="font-mono text-[10px] text-muted-foreground">
          {typeof fact.value}
        </span>
      </div>
    </div>
  );
}

export function ContextBuilder() {
  const orient = useNomosStore((s) => s.orient);
  const selectedSituationId = useNomosStore((s) => s.selectedSituationId);
  const setSelectedSituation = useNomosStore((s) => s.setSelectedSituation);
  const selectedJurisdictionIds = useNomosStore((s) => s.selectedJurisdictionIds);
  const toggleJurisdiction = useNomosStore((s) => s.toggleJurisdiction);
  const asOf = useNomosStore((s) => s.asOf);
  const setAsOf = useNomosStore((s) => s.setAsOf);
  const subjectId = useNomosStore((s) => s.subjectId);
  const setSubjectId = useNomosStore((s) => s.setSubjectId);
  const facts = useNomosStore((s) => s.facts);
  const addFact = useNomosStore((s) => s.addFact);
  const evaluate = useNomosStore((s) => s.evaluate);
  const evaluating = useNomosStore((s) => s.evaluating);

  const situations = orient?.situations ?? [];
  const jurisdictions = orient?.jurisdictions ?? [];

  const contextRequestPreview = useMemo(
    () => ({
      subjectId,
      asOf,
      situationId: selectedSituationId ?? undefined,
      jurisdictionIds: selectedJurisdictionIds,
      facts,
      tenantId: null,
    }),
    [subjectId, asOf, selectedSituationId, selectedJurisdictionIds, facts],
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4 text-emerald-600" aria-hidden />
          Context Builder
        </CardTitle>
        <CardDescription className="text-xs">
          Assemble a ContextRequest — situation, jurisdictions, facts, as-of date — then evaluate.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {/* Subject ID */}
        <div className="space-y-1">
          <Label htmlFor="subjectId" className="text-xs font-medium">
            <User className="mr-1 inline size-3" />
            Subject ID
          </Label>
          <Input
            id="subjectId"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="h-8 font-mono text-xs"
          />
        </div>

        {/* Situation */}
        <div className="space-y-1">
          <Label className="text-xs font-medium">Situation</Label>
          {situations.length === 1 ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-xs">
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                single
              </Badge>
              <span className="font-mono text-[11px]">{situations[0].id}</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium">{situations[0].label}</span>
            </div>
          ) : (
            <Select
              value={selectedSituationId ?? undefined}
              onValueChange={(v) => setSelectedSituation(v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select a situation" />
              </SelectTrigger>
              <SelectContent>
                {situations.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    <span className="font-mono">{s.id}</span> — {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Jurisdictions */}
        <div className="space-y-1">
          <Label className="text-xs font-medium">
            <Globe className="mr-1 inline size-3" />
            Jurisdictions ({selectedJurisdictionIds.length} selected)
          </Label>
          <ScrollArea className="max-h-44 rounded-md border border-border p-2">
            <div className="space-y-1">
              {jurisdictions.map((j) => {
                const checked = selectedJurisdictionIds.includes(j.id);
                return (
                  <label
                    key={j.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent',
                      checked && 'bg-emerald-500/10',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleJurisdiction(j.id)}
                      aria-label={`Toggle jurisdiction ${j.code}`}
                    />
                    <span className="font-mono text-[11px]">{j.code}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="flex-1 truncate">{j.name}</span>
                    <span
                      className={cn(
                        'rounded border px-1 py-0 text-[9px] font-medium uppercase tracking-wider',
                        JUR_KIND_COLOR[j.kind],
                      )}
                    >
                      {j.kind}
                    </span>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* As of */}
        <div className="space-y-1">
          <Label htmlFor="asOf" className="text-xs font-medium">
            <CalendarDays className="mr-1 inline size-3" />
            As-of (evaluate-as_of anchor)
          </Label>
          <Input
            id="asOf"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="h-8 font-mono text-xs"
          />
        </div>

        {/* Facts */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Facts ({facts.length})</Label>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addFact}>
              <Plus className="size-3" /> Add
            </Button>
          </div>
          <ScrollArea className="max-h-72">
            <div className="space-y-1.5">
              {facts.length === 0 ? (
                <p className="rounded border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">
                  No facts. Load a demo preset or add one.
                </p>
              ) : (
                facts.map((f) => <FactRow key={f.id} fact={f} />)
              )}
            </div>
          </ScrollArea>
        </div>

        {/* JSON preview */}
        <details className="rounded-md border border-border bg-muted/30 p-2 text-[11px]">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            ContextRequest (JSON)
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-2 font-mono text-[10px] leading-tight">
            {JSON.stringify(contextRequestPreview, null, 2)}
          </pre>
        </details>

        {/* Evaluate button */}
        <Button
          size="lg"
          className="w-full gap-2 bg-emerald-600 text-white shadow hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
          onClick={() => void evaluate()}
          disabled={evaluating}
          aria-label="Evaluate the state"
        >
          {evaluating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Computing state…
            </>
          ) : (
            <>
              <Play className="size-4" />
              Evaluate
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
