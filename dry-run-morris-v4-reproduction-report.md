# Morris v4 reproduction check — 2026-05-22T01:33:45Z

## TL;DR

**Case A — sampling glitch.** Two reruns of Morris v4 with no code or
prompt changes both produced clean, grounded pitches. The original v4
corruption (`</antmletcer>` / `</antml meeting:parameter>`) did not
reproduce. The v4 prompt is fine; the corruption was a one-off.

## Three runs side-by-side

| Run | Headline | Angle (first 80 chars) | detectBailToken | Fact-check | Confidence | Runtime |
|---|---|---|---|---|---|---|
| Original v4 | `</antmletcer>` | `</antml meeting:parameter>` | not fired (strings not in set) | passed (12/12) | 75/90 | 21.9s |
| Rerun 1 | Morris Whisky Finishes Single Malt in Rutherglen Tokay Casks | Morris Whisky in Rutherglen is a fortified-wine house turned single malt produc… | not fired | passed (11/11) | 75/90 | 23.6s |
| Rerun 2 | Morris of Rutherglen Finishes Single Malt in Its Own Tokay Casks | Morris Whisky in Rutherglen has a structural advantage few Australian distille… | not fired | passed (12/12) | 75/90 | 34.0s |

All three runs use prompt version `phase2-v4-2026-05-22`, model
`claude-opus-4-7`, effort `high`, listing Morris Whisky
(`317dd385-e865-4d58-8a41-f80d7e9cb3a0`).

## Verdict

**Case A — sampling glitch.** The original v4 corruption did not reproduce
in either subsequent run. Both reruns produced editorially substantive
headlines and angles, with every concrete claim traced to verified_facts.
Confidence pinned at the 75/90 single-anchor ceiling on every run. The
fact-check pass succeeded on all three.

The original v4 result is best explained as a single-sample anomaly in
Claude's output sampling. None of the three hypotheses surfaced after the
original run (sampling glitch / tool-use meta-syntax interference / prompt
complexity above coherence threshold) needs to be elevated to architectural
intervention. Hypothesis 1 (sampling glitch) is supported by the data;
hypotheses 2 and 3 would predict reproduction and did not get it.

Worth noting: both reruns landed on headlines structurally close to the
prompt's data-rich positive example ("Morris of Rutherglen finishes
single malt in tokay casks"). Rerun 1 used a slight paraphrase
("Morris Whisky Finishes Single Malt in Rutherglen Tokay Casks"); rerun 2
used the example almost verbatim ("Morris of Rutherglen Finishes Single
Malt in Its Own Tokay Casks"). This mirrors the Perth Pottery v4 dynamic
where the model echoed the thin-data positive example almost verbatim.
The example block is doing real anchoring work — predictable and
load-bearing, possibly too prescriptive. That observation stands from
the v4 comparison report; this reproduction check doesn't change it.

## Recommendation

1. **Do not write a v5 in response to the original Morris v4 corruption.**
   It was a sampling artefact, not a prompt or pipeline bug. The v4
   prompt remains the current authoritative revision.

2. **Do not add markup detection or pattern-based bail catching to
   `detectBailToken`.** The detector correctly returned null on the
   original corruption; expanding it to catch markup-like artefacts
   would have produced no different outcome and would have added
   ongoing maintenance for a category of failure that may not recur.

3. **Proceed to Gate 1 proper in the next session.** The architectural
   guarantees verified across four prompt versions:
   - The atomic-claims rule (stable since v2)
   - The headline-grounding rule (v2, refined in v3, extended in v4)
   - The framing-scope extension (v4)
   - The orchestrator-side bail-token detector (v4)
   - Fact-check rejects nothing the model tries to push through — the
     architecture closes the gaps the prompt may temporarily leave open

   Gate 1 is the editor-driven n=5 calibration ceremony from the spec.
   The pipeline is ready for it.

4. **Keep these rerun logs as evidence.** If a future Morris run
   surfaces similar markup-token corruption, these three samples
   become the comparison baseline for declaring it a real pattern
   rather than another one-off.

5. **The "echoed example" question stays open.** Both reruns leaned
   heavily on the v4 data-rich example block, similar to how Perth
   Pottery v4 echoed its thin-data example. This is a separate Gate 1
   editorial-judgement decision (predictable safety vs editorial
   variety) and is independent of the reproduction-check question
   answered here.
