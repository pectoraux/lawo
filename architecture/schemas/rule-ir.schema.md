# Schema — RuleIR

> Canonical machine-readable rule representation.
> Source: section 11 of the source specification; ADR `decisions/0002-ruleir-v1.md`.
> Authoritative TypeScript surface: `RuleIR`, `ConditionNode`, `RuleEffect`, `Definition` in `src/kernel/primitives/types.ts` (see kernel primitives).
> Status: FROZEN. Changes require an ACO.

`RuleIR` is the canonical machine-readable representation of a rule. Authoritative legal text remains the source of truth; `RuleIR` is the executable representation linked to that source. Free-form prose is **never** the executable representation.

---

## Top-level shape

A `RuleIR` consists of:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | Stable id of this `RuleIR` instance (distinct from the parent `Rule.id`) |
| `ruleId` | `string` | yes | The parent `Rule` this `RuleIR` belongs to |
| `conditions` | `ConditionNode` | yes | Boolean expression tree over facts; rule matches when this evaluates true |
| `exceptions` | `ConditionNode[]` | yes | If any element evaluates true, the rule does not apply (empty array allowed) |
| `effects` | `RuleEffect[]` | yes | Rights/obligations/permissions/restrictions/fees/options/consequences granted or denied when the rule fires |
| `definitions` | `Record<string, Definition>` | no | Term-to-meaning map used to interpret the rule |
| `references` | `string[]` | no | `sourceId` references to the underlying authoritative text |
| `interpretiveStatus` | `'SETTLED' \| 'CONTESTED' \| 'AMBIGUOUS'` | no | Epistemic status of the rule's interpretation |

The parent `Rule` carries `jurisdictionId`, `authorityId`, `sourceId`, `type`, `ruleIr`, `temporal`, `packageId`, `truthLevel`, `code`, `title`, `id`. See `Rule` in `src/kernel/primitives/types.ts`.

---

## ConditionNode

A `ConditionNode` is a discriminated union representing a boolean expression tree over facts.

| Kind | Shape | Description |
| --- | --- | --- |
| `leaf` | `{ kind: 'leaf'; fact: string; operator: LeafOperator; value: unknown }` | Comparison against a fact attribute |
| `and` | `{ kind: 'and'; children: ConditionNode[] }` | Logical conjunction |
| `or` | `{ kind: 'or'; children: ConditionNode[] }` | Logical disjunction |
| `not` | `{ kind: 'not'; child: ConditionNode }` | Logical negation |

### Leaf operators

| Operator | Meaning |
| --- | --- |
| `eq` | equals |
| `neq` | not equals |
| `gt` | greater than |
| `gte` | greater than or equal |
| `lt` | less than |
| `lte` | less than or equal |
| `in` | value is in a set |
| `contains` | value contains an element |
| `exists` | fact is present (the `value` field is ignored) |

The leaf `fact` field is a fact-attribute reference resolved by the `RuleEngine` against the supplied `Fact[]`. The evaluation is pure: same inputs → identical output (per I5, I13).

---

## RuleEffect

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | `EffectKind` | yes | One of `RIGHT`, `OBLIGATION`, `PERMISSION`, `RESTRICTION`, `FEE`, `OPTION`, `CONSEQUENCE` |
| `code` | `string` | yes | Stable code for cross-reference and UI rendering |
| `label` | `string` | yes | Human-readable label |
| `detail` | `string` | no | Optional longer description |
| `amount` | `{ value: number; currency: string; basis?: string }` | no | Monetary amount with optional basis (e.g., `ad_valorem`, `flat`) |

---

## Definition

| Field | Type | Description |
| --- | --- | --- |
| `term` | `string` | The term being defined |
| `meaning` | `string` | The meaning attributed to the term within this rule |

---

## JSON example — customs duty rule with one condition, one exception, one effect

The following example is illustrative. It models a simplified AfCFTA-style customs duty rule for personal effects below a de minimis threshold at a Ghana→Togo border crossing.

```json
{
  "id": "ruleir:afcfta.personal_effects.de_minimis.v1",
  "ruleId": "rule:afcfta.personal_effects.de_minimis",
  "conditions": {
    "kind": "and",
    "children": [
      {
        "kind": "leaf",
        "fact": "goods.category",
        "operator": "eq",
        "value": "personal_effects"
      },
      {
        "kind": "leaf",
        "fact": "goods.total_value_usd",
        "operator": "lt",
        "value": 500
      },
      {
        "kind": "leaf",
        "fact": "goods.restricted_items_present",
        "operator": "eq",
        "value": false
      }
    ]
  },
  "exceptions": [
    {
      "kind": "or",
      "children": [
        {
          "kind": "leaf",
          "fact": "traveler.commercial_purpose",
          "operator": "eq",
          "value": true
        },
        {
          "kind": "leaf",
          "fact": "goods.restricted_items_present",
          "operator": "eq",
          "value": true
        }
      ]
    }
  ],
  "effects": [
    {
      "kind": "RIGHT",
      "code": "RIGHT_DE_MINIMIS_EXEMPTION",
      "label": "De minimis exemption for personal effects under USD 500",
      "detail": "Personal effects below USD 500 are exempt from customs duty under the AfCFTA Protocol on Tariff Concessions."
    },
    {
      "kind": "FEE",
      "code": "FEE_ADMIN_PROCESSING",
      "label": "Administrative processing fee",
      "amount": {
        "value": 0,
        "currency": "USD",
        "basis": "waived_under_de_minimis"
      }
    }
  ],
  "definitions": {
    "personal_effects": {
      "term": "personal_effects",
      "meaning": "Items intended for personal or household use, not for resale, carried by a traveler in accompanied baggage."
    },
    "de_minimis": {
      "term": "de_minimis",
      "meaning": "A threshold below which goods are exempt from customs duty."
    }
  },
  "references": [
    "src:afcfta.protocol_on_tariff_concessions.article_4"
  ],
  "interpretiveStatus": "SETTLED"
}
```

### How this example is evaluated

1. The `RuleEngine` walks `conditions`:
   - `goods.category eq "personal_effects"` — true
   - `goods.total_value_usd lt 500` — true
   - `goods.restricted_items_present eq false` — true
   - `and` of three true leaves → true
2. The engine evaluates `exceptions`:
   - `traveler.commercial_purpose eq true` — false
   - `goods.restricted_items_present eq true` — false
   - `or` of two false leaves → false
3. The rule matches (`conditions true`, no exception true). Both effects fire: a `RIGHT` (de minimis exemption) and a `FEE` (waived administrative processing fee).
4. The `calculation` array records each step for `ProvenanceBuilder`. The rule's `truthLevel` (T0 authoritative, set on the parent `Rule`) flows through to the `FiredEffect`.

---

## Versioning

- The `RuleIR` shape is versioned. Additive changes (new optional fields, new leaf operators added alongside existing ones) are allowed; renames or removals require an ACO and a major bump.
- The `RuleEngine` algorithm carries a version tag in `RuleEvaluationResult` so historical evaluations remain reproducible (per I13).

## See also

- `contracts/rule.md` — `RuleEngine` contract.
- `decisions/0002-ruleir-v1.md` — the ADR that adopted `RuleIR`.
- `decisions/0003-truth-model.md` — the T0–T5 model that flows through `RuleIR` to `RuleEffect` to `FiredEffect`.
- `fixtures/border-crossing-golden-01.json` — a golden fixture that exercises a similar customs duty rule.
