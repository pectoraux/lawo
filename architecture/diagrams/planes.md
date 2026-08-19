# Architecture Diagrams — Planes and Request Flow

> Source: section 2 (planes), section 10 (preferred flow) of the source specification.
> Status: FROZEN. Changes require an ACO.

---

## 1. The 5 Planes and the kernel-at-center / packages-orbiting model

The kernel lives at the center of the Knowledge plane and is consumed by the Intelligence and Execution planes. Packages orbit the kernel; vertical, country, situation, and capability packages compose primitives but never redefine them (per I1, I3, I4, I11).

```mermaid
flowchart TB
    subgraph Experience["A. EXPERIENCE PLANE"]
        A1[Consumer UI]
        A2[Business / Enterprise clients]
        A3[Web / Mobile / API]
        A4[Embedded experiences]
        A5[Conversational UI]
        A6[Real-time situation UI]
        A7[Maps / navigation UI]
        A8[Document UI]
    end

    subgraph Intelligence["B. INTELLIGENCE PLANE"]
        B1[ContextBuilder]
        B2[StateEngine]
        B3[RuleEngine]
        B4[DecisionEngine]
        B5[Optimization engine]
        B6[ProcedureEngine]
        B7[Workflow engine]
        B8[Agent runtime]
        B9[Action planning]
    end

    subgraph Knowledge["C. KNOWLEDGE PLANE"]
        direction TB
        C0[(KERNEL<br/>domain-agnostic primitives)]
        C1[Entity graph]
        C2[Fact graph]
        C3[Jurisdiction graph]
        C4[Authority graph]
        C5[Rule graph]
        C6[Procedure graph]
        C7[Place graph]
        C8[Evidence graph]
        C9[Temporal / version graph]
        C10[Observational / community layer]
    end

    subgraph Execution["D. EXECUTION PLANE"]
        D1[Government integrations]
        D2[Enterprise integrations]
        D3[Forms / filings]
        D4[Payments]
        D5[Notifications]
        D6[Document generation]
        D7[External actions]
        D8[Human-service handoffs]
    end

    subgraph Foundation["E. PLATFORM FOUNDATION"]
        E1[Multi-tenancy]
        E2[Identity]
        E3[Authorization]
        E4[Encryption]
        E5[Auditing]
        E6[Provenance]
        E7[Package registry]
        E8[Package signing]
        E9[Versioning]
        E10[Billing]
        E11[Observability]
        E12[Governance]
    end

    subgraph Packages["PACKAGES (orbit the kernel)"]
        direction LR
        P1[JURISDICTION<br/>e.g. Ghana, Togo, ECOWAS, AfCFTA]
        P2[DOMAIN<br/>e.g. customs, insurance, healthcare]
        P3[SITUATION<br/>e.g. border_crossing, traffic_stop]
        P4[CAPABILITY<br/>e.g. OCR, Maps connector]
    end

    Experience --> Intelligence
    Intelligence --> Knowledge
    Knowledge --> Execution
    Foundation -. cross-cutting .- Intelligence
    Foundation -. cross-cutting .- Knowledge
    Foundation -. cross-cutting .- Execution
    Foundation -. cross-cutting .- Experience
    Packages -. compose primitives, never redefine .-> C0
    Intelligence -. consume kernel .-> C0
    Execution -. consume kernel .-> C0
```

### ASCII variant (renders without a Mermaid viewer)

```
+------------------------------------------------------------------+
| A. EXPERIENCE PLANE                                              |
|   consumer | business | enterprise | web | mobile | API | embed   |
|   conversational | real-time situation | maps/nav | document     |
+--------------------------------+---------------------------------+
                                 |
+--------------------------------v---------------------------------+
| B. INTELLIGENCE PLANE                                            |
|   ContextBuilder | StateEngine | RuleEngine | DecisionEngine     |
|   Optimization | ProcedureEngine | Workflow | Agent | Actions   |
+--------------------------------+---------------------------------+
                                 |
+--------------------------------v---------------------------------+
| C. KNOWLEDGE PLANE                                              |
|                                                                  |
|   +----------------------------------------------------------+   |
|   |                    KERNEL (domain-agnostic)              |   |
|   |   Entity Fact Jurisdiction Authority Rule RuleIR         |   |
|   |   Situation Procedure Action Document Evidence           |   |
|   |   Right Obligation Permission Restriction Fee Actor ...  |   |
|   +--------------------------^-----------------------------+   |
|                              |                                   |
|   graphs: entity | fact | jurisdiction | authority | rule |     |
|   procedure | place | evidence | temporal/version | obs         |
|                                                                  |
+--------------------------------+---------------------------------+
                                 |
+--------------------------------v---------------------------------+
| D. EXECUTION PLANE                                               |
|   government | enterprise | forms | filings | payments |          |
|   notifications | document generation | external | handoffs      |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
| E. PLATFORM FOUNDATION (cross-cutting, all planes)               |
|   multi-tenancy | identity | authorization | encryption |        |
|   auditing | provenance | package registry | package signing |  |
|   versioning | billing | observability | governance              |
+------------------------------------------------------------------+

           PACKAGES orbit the KERNEL (compose, never redefine):
   +-----------+ +-----------+ +--------------+ +-------------+
   |JURISDICTION| |  DOMAIN   | |  SITUATION   | | CAPABILITY  |
   | Ghana      | | customs   | | border_      | | OCR pack    |
   | Togo       | | insurance | | crossing     | | Maps conn   |
   | ECOWAS     | | healthcare| | traffic_stop | | Gov filing  |
   | AfCFTA     | | property  | | hospital_adm | | connector   |
   +-----------+ +-----------+ +--------------+ +-------------+
              |           |             |              |
              +-----------+------------+--------------+
                          | compose primitives
                          v
                    +-----------+
                    |  KERNEL   |
                    +-----------+
```

---

## 2. Request flow

The preferred flow (section 10) is:

```
USER → LLM / parser → structured context → rule engine → decision/state → explanation generator → action → updated state
```

The LLM is **never** authoritative (per I5). Authoritative evaluation happens in the deterministic `RuleEngine` and is captured in `StateSnapshot` with `Provenance`.

```mermaid
flowchart LR
    U[USER] --> LP[LLM / parser<br/>extracts facts,<br/>retrieves candidate rules,<br/>translates query]
    LP --> CB[ContextBuilder<br/>resolves jurisdictions,<br/>authorities, sources,<br/>rules, evidence]
    CB --> RE[RuleEngine<br/>deterministic evaluation<br/>of RuleIR]
    RE --> SE[StateEngine<br/>computes StateSnapshot]
    SE --> PB[ProvenanceBuilder<br/>attaches provenance]
    PB --> DE[DecisionEngine<br/>produces decision,<br/>emits audit events]
    DE --> EG[Explanation generator<br/>LLM summarises for UI,<br/>never authoritative]
    EG --> UI[User-facing answer]
    DE --> AM[ActionModel<br/>Decision -> Action -> Preconditions<br/>-> Execution -> Result<br/>-> Evidence -> Updated State]
    AM --> US[Updated state]

    %% LLM does not feed back into authoritative decisions
    classDef llm fill:#fff3cd,stroke:#856404,color:#000
    classDef deterministic fill:#d4edda,stroke:#155724,color:#000
    class LP,EG llm
    class CB,RE,SE,PB,DE,AM,US deterministic
```

### ASCII variant

```
                            NON-AUTHORITATIVE              AUTHORITATIVE
                            (LLM-assisted)                 (deterministic)
                            ------------------             ------------------

  USER -----------> LLM / parser
                   - extract facts  (T3)
                   - retrieve candidate rules
                   - translate query
                          |
                          v
                   ContextBuilder  ----------------------+
                   - resolve jurisdictions               |
                   - resolve authorities                 |
                   - resolve sources                     |
                   - filter applicable rules (asOf)     |
                          |                             |
                          v                             |
                   RuleEngine  <-------------------------+
                   - deterministic RuleIR evaluation
                   - produces calculation trace
                          |
                          v
                   StateEngine
                   - computes StateSnapshot
                   - fires effects (rights/obligations/...)
                          |
                          v
                   ProvenanceBuilder
                   - ruleId + ruleVersion
                   - source + authority
                   - facts + evidence
                   - calculation + assumptions
                   - truthLevel + asOf
                          |
                          v
                   DecisionEngine
                   - emits DECISION_PRODUCED audit event
                          |
                          +--------------------> Explanation generator
                          |                     - LLM summarises for UI
                          |                     - NEVER authoritative (I5)
                          v                             |
                   ActionModel                          v
                   - Preconditions check           User-facing answer
                   - Execute (FILE/PAY/NOTIFY/
                     NAVIGATE/SUBMIT/GENERATE_...
                     DOCUMENT/REQUEST_INFO/
                     REPORT/HANDOFF)
                   - Result + Evidence
                          |
                          v
                   Updated state
```

### Key non-flow (forbidden)

```
USER --> LLM --> unsupported legal conclusion     # FORBIDDEN per I5
```

---

## Invariants enforced by the diagrams

- **I1** — kernel sits at the center, no vertical concepts leak in.
- **I3, I4** — packages orbit the kernel; they compose primitives, never redefine them.
- **I5** — the request flow places LLMs only at the parser and explanation stages, never in the authoritative evaluation path.
- **I6** — provenance is built for every decision before the action layer runs.
- **I7** — `asOf` is honoured by `ContextBuilder` and `RuleEngine`.
- **I13** — the deterministic path (ContextBuilder → RuleEngine → StateEngine → ProvenanceBuilder → DecisionEngine) is reproducible across runs.

## See also

- `contracts/context.md`, `contracts/rule.md`, `contracts/state.md`, `contracts/decision.md`, `contracts/action.md`, `contracts/audit.md` — the contract surfaces behind each box.
- `fixtures/border-crossing-golden-01.json` — a concrete instance of the request flow for a border crossing.
