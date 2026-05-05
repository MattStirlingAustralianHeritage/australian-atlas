# Way Atlas — Phase 5 Calibration Tracking Items

Items surfaced during Phase 2B (discovery pipeline build) that need
revisiting during Phase 5 calibration. Each item lists the symptom,
the current behaviour, what to watch for, and the trigger that
escalates the item from "tracked" to "needs fixing."

---

## CT-1 — Anthropic web_search returns null page_age on Stage 2 hits

**Surfaced:** wukalina Walk calibration runs (run_ids
`c4e917ab-64e1-418f-9dfe-be4fa84dfd27` and
`228007eb-d876-49d0-95a1-802a15ba137e`, both 2026-05-XX).

**Symptom:** Anthropic's `web_search` server tool returned
`page_age = null` on every Stage 2 (editorial press) hit across two
runs. The Stage 2 runner's `parsePageAge()` handles null gracefully
(persists `published_date = null` on the signal's `raw_data`), and
Stage 6's `silence.press_24mo` aggregator treats null dates
conservatively — it counts a null-date signal as "in window" so
silence won't fire on operators whose press hits exist but lack
parseable dates.

**Why it matters:** Stage 6's silence signals are editorially
load-bearing — the editor reads them at triage. If `page_age` stays
null indefinitely, `silence.press_24mo` becomes a binary
"any-press-ever" check rather than the date-windowed "no-press-in-
last-24-months" check the spec calls for.

**What to watch for during Phase 5 calibration (n=5, n=20, n=50):**
- Across all 75 calibration operators, count how many Stage 2
  signals come back with non-null `published_date`.
- If <50% have parseable dates, the date-windowed silence signal
  is unreliable.

**Trigger to escalate:**
- If page_age stays null on all/most operators across multiple
  calibration runs, swap Stage 2's source to one that does return
  publication dates reliably (Tavily and Brave both return
  `published_date` as a first-class field).
- Or: add a fallback date extractor — fetch the article URL, parse
  `<meta property="article:published_time">` or schema.org JSON-LD
  `datePublished`. Polite-fetch already in place.

**Rough fix size:** ~50 LOC for an HTML-meta date extractor; ~150
LOC for a Tavily/Brave swap (consumer changes only — raw search
JSON already persisted on `raw_data` so the swap is bounded).

**Status:** TRACKING. Don't fix during Phase 2B. Re-evaluate after
Phase 5 Gate 1 calibration (n=5).

---

(Future calibration items append below.)
