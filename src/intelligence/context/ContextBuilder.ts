/**
 * Nomos — Context Builder  (architecture §23, contracts/context.md)
 * --------------------------------------------------
 * The ContextBuilder is the entry point of the UNDERSTAND family. It
 * resolves a ContextRequest against a PackageRegistry and produces a
 * ContextBundle: the set of jurisdictions, authorities, rules, evidence
 * and sources that apply to the subject at a given `asOf`.
 *
 * The builder is deterministic modulo package contents. It performs no IO
 * beyond reading the registry and the jurisdiction graph. It never consults
 * an LLM (I5).
 *
 * Resolution algorithm:
 *   1. resolvedJurisdictions = jurisdictionGraph.applicableFor(ids, asOf)
 *      — already returns the union of the requested jurisdictions and their
 *        ancestors, filtered to those whose temporal range covers asOf.
 *   2. resolvedAuthorities   = authorities whose jurisdictionId is in
 *                              resolvedJurisdictions.
 *   3. applicableRules       = rules where (a) covers(rule.temporal, asOf)
 *                              AND (b) rule.jurisdictionId is in
 *                              resolvedJurisdictions. (The ancestors check
 *                              is implicit — applicableFor already walked
 *                              the ancestor edges.)
 *   4. evidence              = evidence whose extractedFactIds overlap with
 *                              the request's fact ids.
 *   5. sources               = sources referenced by applicableRules
 *                              (by sourceId).
 */

import type { ContextBundle, ContextRequest } from '@/kernel/primitives/types';
import type { ContextBuilder, PackageRegistry } from '@/kernel/contracts/contracts';
import { covers } from '@/kernel/time/TemporalModel';

class DefaultContextBuilder implements ContextBuilder {
  build(request: ContextRequest, registry: PackageRegistry): ContextBundle {
    // 1. Resolved jurisdictions — the union of (requested + ancestors),
    //    filtered to those whose temporal range covers asOf.
    const resolvedJurisdictions = registry.jurisdictionGraph.applicableFor(
      request.jurisdictionIds,
      request.asOf,
    );

    const jurisdictionIdSet = new Set(resolvedJurisdictions.map((j) => j.id));

    // 2. Resolved authorities — those attached to a resolved jurisdiction.
    const allAuthorities = registry.listAuthorities();
    const resolvedAuthorities = allAuthorities.filter(
      (a) => jurisdictionIdSet.has(a.jurisdictionId),
    );

    // 3. Applicable rules — in effect as of asOf AND attached to a
    //    resolved jurisdiction.
    const allRules = registry.listRules();
    const applicableRules = allRules.filter(
      (rule) => covers(rule.temporal, request.asOf) && jurisdictionIdSet.has(rule.jurisdictionId),
    );

    // 4. Evidence — any evidence item whose extractedFactIds overlaps with
    //    the set of fact ids supplied in the request.
    const requestFactIds = new Set(request.facts.map((f) => f.id));
    const allEvidence = registry.listEvidence();
    const evidence =
      requestFactIds.size === 0
        ? []
        : allEvidence.filter((e) => e.extractedFactIds.some((fid) => requestFactIds.has(fid)));

    // 5. Sources — referenced by any applicable rule (by sourceId).
    const referencedSourceIds = new Set(applicableRules.map((r) => r.sourceId));
    const allSources = registry.listSources();
    const sources = allSources.filter((s) => referencedSourceIds.has(s.id));

    return {
      request,
      resolvedJurisdictions,
      resolvedAuthorities,
      applicableRules,
      evidence,
      sources,
    };
  }
}

/**
 * Factory — produces a fresh ContextBuilder.
 */
export function createContextBuilder(): ContextBuilder {
  return new DefaultContextBuilder();
}
