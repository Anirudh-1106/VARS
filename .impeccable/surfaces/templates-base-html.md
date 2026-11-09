---
version: 1
slug: "templates-base-html"
primary_target: "templates/base.html"
related_targets: ["templates/studio.html","templates/interview.html","templates/report.html","templates/build.html","templates/cell.html","templates/home.html"]
---

# Surface brief: VARS app shell (Resume Studio, Build by voice, Mock interview, Report, Placement cell, Home)

Scope: every working screen of the VARS web app, sharing one shell. Visitor mode: **Operate** (Home hub leans Persuade inside the same world).

Audience and job: students preparing for campus placements (analyse resume → fix → rehearse rounds → read report) and placement-cell coordinators (create drive links, read cohort files). Constraints: zero server retention, session-only browser state, typed alternatives to every voice step, WCAG AA.

Memorable moment: the readiness status clearing like a PNR, e.g. `WL 7 → RAC 3 → CNF`, and the report arriving as a "chart prepared".

## Direction contract

THESIS: Placement readiness reads like a railway PNR. Every target role, skill gap and round carries a counted status (WL n → RAC n → CNF) that clears as concrete items are fixed. Refuses the category default of a score ring over suggestion cards on grey.

OWN-WORLD: Continuous-stationery paper ground (#F3F5F0) with pale green bars (#DDEAD6) on data rows; ribbon ink (#22212A); a committed coach-blue shell rail (#1C4A9C). Status inks only on statuses: CNF #1F7A4D, RAC #9A6200, WL #B23A2B. Three inks, no in-between greys (raise from Datamatics). Anek Latin for UI (Indian foundry, Malayalam sibling), Doto dot-matrix ONLY for status codes and headline numerals, JetBrains Mono for code and line IDs. Square-ish 4px corners, hairline rules, soft offset shadow only on the document page. One ink reserved for the current step: coach blue marks the active tab, round and question and nothing else decorative (raise from Orienteering). Findings hang in a margin with one-pixel leaders to the quoted resume line (raise from Centre-Rail). Interview panels persist across rounds; End interview isolated (raise from Dark Console).

STORY: The student sees what a recruiter sees, line by line, believes the score because each number cites a line, fixes the waitlisted lines, watches status clear, then rehearses and gets a chart-prepared report.

FIRST VIEWPORT: Coach-blue left rail (236px) with VARS in Doto, six work areas, and the privacy line pinned at its foot. Work area: title row (h1, file name in mono, target-role select, primary "Start mock interview" in ink). Tabs (Analysis / Role fit / Match a job description / Ask about my resume) with a coach-blue underline. Two columns: resume page on white paper left with WL/RAC pins at quoted lines; right, the dot-matrix status block (RAC 3, Backend Developer, trail WL 7 → RAC 3 → CNF) over a six-cell score strip (overall cell inverted ink) over a green-bar findings table (Line / What the recruiter sees / Status).

FORM: Reservation Chart, candidate 7 of 7 on the ordered list. seed:819127bdc3d66504

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

When a finding is fixed (rewrite applied or marked done), its row's status flips to CNF in place, holds a highlight until noticed, and the header status counts down (WL 4 → RAC 3) with a short dot-matrix tick. The same status grammar appears for role fit, interview rounds and the report verdict.

## Unresolved

- Exact avatar illustration style for the interviewer (flat illustrated bust, palette-bound).
