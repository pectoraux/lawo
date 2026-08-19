/**
 * Nomos — client state store (Zustand + immer middleware).
 *
 * Owns: orient overview, demo presets, the live ContextRequest being assembled
 * (situation, jurisdictions, as-of, facts), the most recent decision result,
 * the audit trail, and loading/error flags. All fetches go through
 * `@/lib/nomos-api` (relative URLs only).
 */
'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { toast } from 'sonner';
import type {
  AuditEvent,
  Fact,
  Provenance,
  StateSnapshot,
  TruthLevel,
} from '@/kernel/primitives/types';
import {
  getOrient,
  getDemoPresets,
  getAudit,
  postState,
  type OrientResponse,
  type DemoPreset,
} from '@/lib/nomos-api';

export interface DecisionResult {
  state: StateSnapshot;
  provenance: Provenance[];
  audit: AuditEvent[];
}

export interface NomosStore {
  // --- state
  orient: OrientResponse | null;
  presets: DemoPreset[] | null;
  selectedSituationId: string | null;
  selectedJurisdictionIds: string[];
  asOf: string;
  subjectId: string;
  facts: Fact[];
  decision: DecisionResult | null;
  loading: boolean;
  evaluating: boolean;
  error: string | null;
  auditTrail: AuditEvent[];
  auditLoading: boolean;
  initialized: boolean;

  // --- actions
  init: () => Promise<void>;
  applyPreset: (preset: DemoPreset) => void;
  setSelectedSituation: (id: string | null) => void;
  toggleJurisdiction: (id: string) => void;
  setAsOf: (iso: string) => void;
  setSubjectId: (id: string) => void;
  updateFact: (id: string, patch: Partial<Fact>) => void;
  updateFactValue: (id: string, value: unknown) => void;
  addFact: () => void;
  removeFact: (id: string) => void;
  evaluate: () => Promise<void>;
  refreshAudit: () => Promise<void>;
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function newFactId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

export const useNomosStore = create<NomosStore>()(
  immer((set, get) => ({
    orient: null,
    presets: null,
    selectedSituationId: null,
    selectedJurisdictionIds: [],
    asOf: todayIso(),
    subjectId: 'sub_demo_traveler',
    facts: [],
    decision: null,
    loading: false,
    evaluating: false,
    error: null,
    auditTrail: [],
    auditLoading: false,
    initialized: false,

    init: async () => {
      if (get().loading) return;
      set((s) => {
        s.loading = true;
        s.error = null;
      });
      try {
        const [orient, presets, audit] = await Promise.all([
          getOrient(),
          getDemoPresets(),
          getAudit(50),
        ]);
        set((s) => {
          s.orient = orient;
          s.presets = presets.presets;
          s.auditTrail = audit.events;
          // Pre-select the first situation if exactly one exists
          if (orient.situations.length > 0 && !s.selectedSituationId) {
            s.selectedSituationId = orient.situations[0].id;
          }
          s.initialized = true;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        set((s) => {
          s.error = msg;
        });
        toast.error('Failed to initialize Nomos', { description: msg });
      } finally {
        set((s) => {
          s.loading = false;
        });
      }
    },

    applyPreset: (preset) => {
      set((s) => {
        s.selectedSituationId = preset.situationId;
        s.selectedJurisdictionIds = [...preset.jurisdictionIds];
        s.asOf = preset.asOf;
        s.facts = preset.facts.map((f) => ({
          id: f.id,
          subjectId: s.subjectId,
          attribute: f.attribute,
          value: f.value,
          truthLevel: f.truthLevel,
          observedAt: f.observedAt,
          tenantId: null,
        }));
      });
      // Fire the evaluation after the state mutation flushes
      void get().evaluate();
    },

    setSelectedSituation: (id) => {
      set((s) => {
        s.selectedSituationId = id;
      });
    },

    toggleJurisdiction: (id) => {
      set((s) => {
        const idx = s.selectedJurisdictionIds.indexOf(id);
        if (idx >= 0) {
          s.selectedJurisdictionIds.splice(idx, 1);
        } else {
          s.selectedJurisdictionIds.push(id);
        }
      });
    },

    setAsOf: (iso) => {
      set((s) => {
        s.asOf = iso;
      });
    },

    setSubjectId: (id) => {
      set((s) => {
        s.subjectId = id;
        // cascade subjectId into existing facts so submissions are consistent
        for (const f of s.facts) {
          f.subjectId = id;
        }
      });
    },

    updateFact: (id, patch) => {
      set((s) => {
        const idx = s.facts.findIndex((f) => f.id === id);
        if (idx >= 0) {
          s.facts[idx] = { ...s.facts[idx], ...patch };
        }
      });
    },

    updateFactValue: (id, value) => {
      set((s) => {
        const idx = s.facts.findIndex((f) => f.id === id);
        if (idx >= 0) {
          s.facts[idx].value = value;
        }
      });
    },

    addFact: () => {
      set((s) => {
        const id = newFactId();
        s.facts.push({
          id,
          subjectId: s.subjectId,
          attribute: 'newAttribute',
          value: '',
          truthLevel: 'T0' as TruthLevel,
          observedAt: s.asOf,
          tenantId: null,
        });
      });
    },

    removeFact: (id) => {
      set((s) => {
        const idx = s.facts.findIndex((f) => f.id === id);
        if (idx >= 0) {
          s.facts.splice(idx, 1);
        }
      });
    },

    evaluate: async () => {
      const st = get();
      if (st.evaluating) return;
      if (!st.selectedSituationId) {
        toast.error('No situation selected', {
          description: 'Pick a situation or load a demo preset before evaluating.',
        });
        return;
      }
      if (st.selectedJurisdictionIds.length === 0) {
        toast.error('No jurisdictions selected', {
          description: 'Select at least one jurisdiction in the Context Builder.',
        });
        return;
      }
      if (st.facts.length === 0) {
        toast.error('No facts supplied', {
          description: 'Add at least one fact before evaluating the state.',
        });
        return;
      }
      set((s) => {
        s.evaluating = true;
        s.error = null;
      });
      try {
        const body = {
          subjectId: st.subjectId,
          asOf: st.asOf,
          situationId: st.selectedSituationId ?? undefined,
          facts: st.facts,
          jurisdictionIds: st.selectedJurisdictionIds,
          objective: undefined,
          tenantId: null as string | null,
          persist: false,
        };
        const result = await postState(body);
        set((s) => {
          s.decision = result;
          // merge any new audit events at the head
          const seen = new Set(s.auditTrail.map((e) => e.id));
          for (const e of result.audit) {
            if (!seen.has(e.id)) {
              s.auditTrail.unshift(e);
            }
          }
        });
        toast.success('Decision computed', {
          description: `${result.state.firedEffects.length} effect(s) fired · truth level ${result.state.truthLevel}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        set((s) => {
          s.error = msg;
        });
        toast.error('Evaluation failed', { description: msg });
      } finally {
        set((s) => {
          s.evaluating = false;
        });
      }
    },

    refreshAudit: async () => {
      set((s) => {
        s.auditLoading = true;
      });
      try {
        const audit = await getAudit(50);
        set((s) => {
          s.auditTrail = audit.events;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error('Audit refresh failed', { description: msg });
      } finally {
        set((s) => {
          s.auditLoading = false;
        });
      }
    },
  })),
);
