# Contract — Evidence (EvidenceGraph)

> Family: UNDERSTAND.
> Implementation surface: `src/kernel/evidence/EvidenceGraph.ts` (primitives in `src/kernel/primitives/types.ts`).
> Status: FROZEN. Changes require an ACO.

## Purpose

The `EvidenceGraph` turns raw documents, observations, and source materials into structured evidence that downstream engines can rely on. It implements the document pipeline:

```
INPUT → CLASSIFY → OCR / VISION → EXTRACT → NORMALIZE → ENTITY RESOLUTION → FACTS → EVIDENCE GRAPH
```

Document-extracted facts must never be stored without retaining provenance to the underlying page/region/document where practical (section 16).

The pipeline is domain-agnostic: it operates on `Document` and `Evidence`, never on `InsuranceClaim`, `ADU`, etc. (per I1, I3).

## Inputs

- `Document` — `{ id, type, title, tenantId, pages? }`
- Optional classification hints (the `type` field, e.g., `passport`, `invoice` — domain-neutral strings supplied by a document processor capability)
- The pipeline stages consume the previous stage's output; e.g., `EXTRACT` consumes OCR output and produces raw extracted triples; `NORMALIZE` consumes those and produces typed candidates.

## Outputs

- `Evidence[]` — each carrying `id`, optional `documentId`, optional `page`, optional `region`, `extractedFactIds`, `confidence`
- `Fact[]` derived from the evidence, with `truthLevel: 'T3'` (expert interpretation) at most unless explicitly elevated by an authoritative source
- An evidence-graph structure linking each `Fact` back to its `Evidence` and `Document`

## Errors

- `ClassificationError` — document type cannot be determined; aborts the pipeline rather than guessing
- `OcrFailureError` — OCR returned no usable text; surfaces document id and page
- `ExtractionError` — extractor produced no candidates
- `EntityResolutionConflictError` — multiple candidate entities for the same attribute; surfaces the candidates

Errors are structured and never masked.

## Versioning

- The `Evidence` shape is versioned; additive changes are allowed, renames/removals require an ACO.
- The pipeline stage contract is stable: each stage takes the previous stage's output and produces the next. Stages may be swapped only with an ACO.

## Security

- Every `Document` carries a `tenantId`; pipeline stages MUST respect it (per I9).
- Documents are never indexed into global search without explicit, authorized publication.
- The pipeline never leaks document content into LLM training corpora (per section 25).

## Provenance

Every extracted `Fact` retains its `source` (a `SourceRef` referencing the originating `Document`, `page`, and `region` where practical). Downstream `ProvenanceBuilder` uses this to satisfy I6. The graph keeps the chain `Fact → Evidence → Document` intact end-to-end.

## Idempotency

Running the pipeline on the same document with the same document-processor version produces identical evidence. OCR stage is deterministic for a fixed processor version; extracted facts are deterministic given the OCR output and extractor version (per I13).

## Failure Semantics

- If a stage fails, downstream stages are not run; the pipeline returns a structured error indicating the failed stage.
- If a stage produces partial output (e.g., OCR succeeded on some pages), the partial output is preserved with explicit annotations; the engine never silently drops pages.
- A document with no extractable evidence still produces an empty `Evidence[]` and the original document is retained.

## Invariants Enforced

- **I1, I3** — pipeline is domain-agnostic.
- **I5** — LLM-assisted extraction (if any) is advisory; extracted facts are tagged at T3 or below.
- **I6** — every extracted fact retains its source for provenance.
- **I9** — tenant isolation enforced throughout the pipeline.
- **I13** — reproducible across runs for the same processor versions.
