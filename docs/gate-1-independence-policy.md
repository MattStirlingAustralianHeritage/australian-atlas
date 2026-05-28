# Gate 1 — Operational Independence Policy

**Date:** 25 May 2026
**Author:** Matt Smith
**Status:** Active. Canonical policy for Way Discovery Gate 1 and equivalent independence filters across the Atlas Network.

This document defines what operational independence means for Atlas Network inclusion. It exists because Gate 1 was implemented in code (`lib/prospector/way-discovery/gate-1-independence.js`) and applied to the `commercial_groups` table without a corresponding written policy. The criteria below are canonical; the code and table data are the implementation.

---

## What Gate 1 protects

Atlas Network surfaces operators whose specific local decisions are editorially interesting. The editorial voice depends on local-specificity: named people making particular choices in particular places, anchored to verifiable specifics (founding dates, signature products, distinctive histories).

Outlets of larger entities are editorially fungible. A Marriott in Brisbane and a Marriott in Perth are operationally identical and editorially interchangeable. The Atlas reader value proposition does not survive that fungibility.

Gate 1 is the filter that excludes operators whose local outlets don't make their own operational decisions. It applies regardless of the parent entity's tax status, moral standing, or sector.

## The operational test

For any local outlet of a larger entity, the question is: does the local property make its own decisions about

- signage and brand presentation
- staffing policy and hiring
- stock selection (retail) or service offering (institutional)
- opening hours framework
- pricing or contribution policy
- programming, events, or distinctive local activity

If most of these are determined centrally rather than locally, the outlet fails Gate 1. The local manager's autonomy to choose paint colour or arrange shelves does not constitute operational independence.

## Categories that fail Gate 1

**Commercial chains and franchises.** Hotel groups (Marriott, Accor, IHG, Hilton). Retail franchises (Toyworld, Bunnings, Officeworks, Dymocks). Food franchises (McDonald's, Subway, KFC). Recorded in `commercial_groups` with category `hotel_accommodation`, `retail_chain`, etc.

**Charity shop chains.** Salvation Army Stores, St Vincent de Paul (Vinnies), Brotherhood of St Laurence, Red Cross, Anglicare, Save the Children, Lifeline, RSPCA, Diabetes Australia, Cancer Council, Endeavour Foundation, MS Australia, and equivalent national charitable retail networks. The charitable purpose of the parent organisation does not exempt the local outlet from operational-independence requirements. Recorded in `commercial_groups` with category `charity_chain`.

**Government and institutional outlets.** Tourism information centres operating under standardised state branding. Council-run venues with no programming autonomy. Library branches operating under standard policy with no distinctive local programming. Recorded in `commercial_groups` with category `institutional`.

## Edge cases — case-by-case assessment

Some outlets of larger entities retain genuine operational autonomy and may pass Gate 1 case-by-case. These are flagged `verify_case_by_case = true` in `commercial_groups`:

- **Religious-owned operators** where a local committee or appointed manager makes operational decisions (e.g. a church-run café whose menu, hours, and staffing are determined locally)
- **Council-owned venues with genuine programming autonomy** (e.g. a council gallery whose director programmes exhibitions independently)
- **Library cafés and museum gift shops** where the host institution itself is a one-of-a-kind operator and the shop runs as an extension of it
- **Cooperatives and mutual organisations** where local member control is genuine
- **Luxury operator networks** with distinctive per-property character (current network examples: Spicers Retreats, Baillie Lodges, Lancemore Group, Boathouse Group)

These are assessed individually against the operational test above. The case-by-case flag does not exempt the outlet from the test; it routes the decision through editorial judgement rather than automatic exclusion.

## Categories that pass Gate 1

**Independent local operators.** Single-location or small multi-location businesses where ownership and operational decisions sit locally. The default Atlas inclusion case.

**Family-owned multi-location operators** where each location retains operational autonomy and family/local management. Subject to operational test; not all pass automatically.

**Distinctive regional networks** where each property has individual character despite shared ownership (subject to case-by-case assessment).

## What this policy does not do

Gate 1 is not a moral judgement. Excluding Salvos shops from Atlas does not say Salvos shops have no value; it says they are not the kind of operator Atlas exists to surface. They may be valuable, well-loved, locally important, and editorially uninteresting in the specific sense Atlas requires.

Gate 1 is not a quality judgement. Some independent operators that pass Gate 1 are mediocre; some institutional outlets that fail Gate 1 are excellent. Quality assessment is downstream of Gate 1 — handled by Candidate Review and editorial standards.

Gate 1 is not a permanent classification. An operator that fails Gate 1 today may pass later (e.g. a charity divests its retail arm to local control; a chain franchise becomes independent). The `commercial_groups` table can be revised as ownership and operational structures change.

## Implementation references

- `lib/prospector/way-discovery/gate-1-independence.js` — Way prospector implementation
- `commercial_groups` table — operator exclusion list with brand and domain matching data
- Finding B audit (25 May 2026) — network-wide application of Gate 1 against current `commercial_groups`. See `docs/audits/portal-ssot-audit-2026-05-21.md` for results.

## Revision history

- **2026-05-25** — Initial policy document. Codified the operational independence framework that had been implicit in code. Added charity shop chain exclusion (Salvos, Vinnies, Brotherhood, Red Cross, Anglicare, and similar). Added institutional outlet exclusion.
