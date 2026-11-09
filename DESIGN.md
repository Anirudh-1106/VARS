---
name: VARS
description: Placement coach where readiness reads like a railway reservation status (WL n, RAC n, CNF).
colors:
  paper: "#F3F5F0"
  paper-2: "#F8FAF6"
  sheet: "#FFFFFF"
  bar: "#DDEAD6"
  bar-2: "#E9F1E5"
  rule: "#C9D3C4"
  rule-2: "#DEE4DA"
  control-rule: "#A9B3A4"
  ink: "#22212A"
  ink-hover: "#3A3944"
  ink-2: "#4E4C58"
  ink-3: "#5F5D6A"
  ink-inverse-muted: "#CFCDD8"
  coach: "#1C4A9C"
  coach-2: "#163D82"
  coach-wash: "#E3EAF7"
  coach-ink: "#FFFFFF"
  coach-ink-2: "#C3D1EE"
  cnf: "#1F7A4D"
  rac: "#9A6200"
  wl: "#B23A2B"
  wl-deep: "#962F22"
  cnf-bg: "#DCEFE3"
  rac-bg: "#F5E6C6"
  wl-bg: "#F6DCD7"
  hl-wl: "#F7D9D3"
  hl-rac: "#F8E7C2"
typography:
  display:
    fontFamily: "Anek Latin, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(40px, 5.6vw, 76px)"
    fontWeight: 750
    lineHeight: 0.98
    letterSpacing: "-0.015em"
    fontVariation: "\"wdth\" 82"
  headline:
    fontFamily: "Anek Latin, Segoe UI, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.005em"
    fontVariation: "\"wdth\" 88"
  title:
    fontFamily: "Anek Latin, Segoe UI, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.2
    fontVariation: "\"wdth\" 90"
  body:
    fontFamily: "Anek Latin, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\""
    fontVariation: "\"wdth\" 100"
  rule-label:
    fontFamily: "Anek Latin, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.08em"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.05em"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  status-display:
    fontFamily: "Doto, Anek Latin, monospace"
    fontSize: "clamp(52px, 6vw, 76px)"
    fontWeight: 900
    lineHeight: 0.8
    letterSpacing: "0.03em"
  numeral:
    fontFamily: "Doto, Anek Latin, monospace"
    fontSize: "32px"
    fontWeight: 900
    lineHeight: 1.1
  status-inline:
    fontFamily: "Doto, Anek Latin, monospace"
    fontSize: "15px"
    fontWeight: 900
    letterSpacing: "0.03em"
rounded:
  hair: "2px"
  sm: "3px"
  md: "4px"
  tile: "6px"
  round: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  2xl: "30px"
  gutter: "clamp(16px, 2.6vw, 34px)"
  rail: "236px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.sheet}"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 8px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.bar-2}"
  button-danger:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.wl}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-danger-hover:
    backgroundColor: "{colors.wl}"
    textColor: "{colors.sheet}"
  button-end-interview:
    backgroundColor: "{colors.wl}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  pnr-chip-cnf:
    backgroundColor: "{colors.cnf}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.hair}"
    padding: "4px 6px 3px"
  pnr-chip-rac:
    backgroundColor: "{colors.rac}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.hair}"
    padding: "4px 6px 3px"
  pnr-chip-wl:
    backgroundColor: "{colors.wl}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.hair}"
    padding: "4px 6px 3px"
  line-pin:
    textColor: "{colors.sheet}"
    typography: "{typography.label}"
    rounded: "{rounded.hair}"
    padding: "3px 4px 2px"
  shell-rail:
    backgroundColor: "{colors.coach}"
    textColor: "{colors.coach-ink-2}"
    width: "{spacing.rail}"
  nav-item-current:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.coach}"
    padding: "10px 24px"
  score-cell-overall:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    typography: "{typography.numeral}"
    padding: "11px 14px 9px"
  panel:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    padding: "16px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
---

# Design System: VARS

## Overview

**Creative North Star: "The Reservation Chart"**

VARS treats placement readiness like an Indian Railways PNR. Every target role, open finding, interview round and report verdict carries a counted status that clears as concrete items are fixed: WL 7, then RAC 3, then CNF. The surface is continuous-stationery paper with pale green bars on data rows, ribbon-black ink, and a coach-blue shell rail. Status codes, headline numerals and the wordmark print in a dot-matrix face, so the number a student is waiting on looks like a printed chart entry rather than a score ring.

Density is that of an operating tool: hairline rules, tables with line IDs, a resume page on white paper with pins in its margin and leaders to the quoted line, and a findings chart beside it. Colour is spent sparingly. Three status inks appear only on statuses; coach blue marks the shell and the one current step; everything else is ink on paper. The report arrives as a "chart prepared" printout with an ink header band and a perforation rule.

The world refuses the category default of a score ring over suggestion cards on grey, and it refuses decoration that does not carry a reading: no gradients, no glows, no status colour used as ornament.

**Key Characteristics:**
- Readiness grammar: count the open items; 0 is CNF, 1 to 3 is RAC n, more is WL n.
- Paper ground, green-bar rows, ribbon ink; one coach-blue rail.
- Doto dot-matrix reserved for status codes, headline numerals and the VARS wordmark.
- JetBrains Mono 700 caps for labels, speaker names, line IDs and tickers.
- Square-ish 4px corners, 1px hairlines, heavy 2px ink rules under status blocks.
- Shadow only where something is a physical document or floats above the page.

## Colors

Three inks on stationery: ribbon black for everything, coach blue for where you are, and the three reservation statuses for how ready you are.

### Primary
- **Coach Blue** (coach): the shell rail, the live-room top bar, and the single current step: active tab underline, current chart-row outline, current round station, the question ID, the selected option card, the focus ring and text links. Its darker step (coach-2) is the rail hover and link hover; Coach Wash is the background of a selected option or a focused resume line.

### Secondary
- **Ribbon Ink** (ink): body text, primary buttons, the 2px rule under status blocks and section titles, inverted score cells, report and enquiry header bands, toasts, captions. Hover lifts to ink-hover.

### Tertiary (status inks, statuses only)
- **Confirmed Green** (cnf): CNF codes and chips, applied-fix highlights (cnf-bg), passing tests.
- **RAC Amber** (rac): RAC codes and chips, quoted lines that need work (hl-rac), placeholders to fill (rac-bg), the answer clock when time is short.
- **Waitlist Red** (wl): WL codes and chips, the worst quoted lines (hl-wl), recording state, End interview, destructive actions. wl-deep is its hover.

### Neutral
- **Stationery Paper** (paper): the app ground. paper-2 is the lighter odd row and side-panel ground.
- **White Sheet** (sheet): documents, panels, inputs, score strip.
- **Green Bar** (bar): even rows of every data chart; bar-2 is ghost-button hover and neutral notices.
- **Hairline** (rule, rule-2): row and panel dividers. **Control Rule** (control-rule): borders of inputs, secondary buttons, option cards and steppers.
- **Faded Ribbon** (ink-2, ink-3): secondary text and idle labels; ink-inverse-muted is secondary text on ink bands.

### Named Rules
**The Status Ink Rule.** cnf, rac and wl (and their -bg and hl- tints) appear only where they encode a readiness state, a test result or a recording/destructive action. Never as section colour, icon tint or decoration.

**The Current Step Rule.** Coach blue is the shell rail plus the one thing that is current or selected. If two unrelated elements on a screen are blue outside the rail, one of them is wrong. Primary buttons are ink, never blue.

## Typography

**Display Font:** Doto (dot-matrix, with Anek Latin fallback), for status codes, headline numerals and the wordmark only
**Body Font:** Anek Latin (variable width and weight, with Segoe UI, system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, Cascadia Mono, Consolas)

**Character:** Anek Latin, an Indian-foundry family with a Malayalam sibling, does all reading and narrows its width axis (82 to 92) for headings so they sit compact like a printed form. Doto prints the numbers a student is waiting on as a line printer would. JetBrains Mono carries the clerical layer: line IDs, speaker names, file metadata, loading tickers.

### Hierarchy
- **Display** (Anek Latin 750, clamp(40px, 5.6vw, 76px), 0.98, wdth 82): the Home hero heading only.
- **Headline** (Anek Latin 700, 28px, 1.15, wdth 88; 24px under 960px): the page title in the work-area head row.
- **Title** (Anek Latin 700, 21px, 1.2, wdth 90): section headings; panel heads drop to 15px 700.
- **Body** (Anek Latin 400, 16px, 1.5, tabular numerals): running text; ledes cap at 68ch, chat and verdict text at 72ch. Chart cells run 15px.
- **Rule label** (Anek Latin 700, 12 to 13px, 0.07 to 0.08em, uppercase): chart column heads, fieldset legends and section rule titles that sit on a 1px ink rule. These name the table or block they sit on; they are headings, not decoration.
- **Label** (JetBrains Mono 700, 12 to 14px, 0.04 to 0.08em, caps): line IDs, margin pins, speaker names (YOU, interviewer), pass and enquiry headers, step counters, tickers.
- **Code** (JetBrains Mono 400, 13 to 14px, 1.5 to 1.6): file names in the head row, code editor, I/O samples.
- **Status display** (Doto 900, clamp(52px, 6vw, 76px), 0.8, tightened word-spacing): the status code in a status block.
- **Numeral** (Doto 900, 32px, 1.1): score-strip values, clocks (17 to 26px), stepper outputs, report stamp.
- **Status inline** (Doto 900, 13 to 16px): chips, the status column of charts, the trail (WL 9 to CNF).

### Named Rules
**The Dot-Matrix Rule.** Doto is used only for status codes (WL n, RAC n, CNF), headline numerals and the VARS wordmark. Never for words, labels, buttons or headings.

**The Clerk's Hand Rule.** Labels, speaker names, line IDs and tickers are JetBrains Mono 700 caps. UI text is Anek Latin. A third role for either face needs a reason in the data.

## Layout

A two-column shell: a 236px sticky coach-blue rail (wordmark, six work areas with optional status tags, the privacy line pinned at its foot) and a fluid work area. The work area opens with a head row (page title, file meta in mono, target select, actions pushed right with the primary ink button last), then a tab strip on a hairline, then the body. Horizontal padding is the fluid gutter (clamp(16px, 2.6vw, 34px)); the body ends with 56px bottom room.

Screens divide into a document column and an analysis column (Resume Studio: up to 560px sheet left, sticky and independently scrollable; status block, score strip and findings chart right). Spacing steps are 4, 8, 12, 16, 22 and 30px; 30px is the gap between major columns. Content blocks stack on 1px or 2px ink rules rather than in boxed cards.

Responsive: under 1180px Studio columns stack; under 960px the rail becomes a sticky top bar with a menu button, the score strip folds to three columns, and the status block stacks; under 520px tabs switch to short labels with a right fade mask and the strip folds to two columns. The live interview room hides the rail and uses a coach-blue top bar with round stations, a stage tile and a side column for question, answer and log.

## Elevation & Depth

Flat by default. Depth comes from tone (paper vs white sheet vs green bar) and from rules: 1px hairlines between rows, a 1px ink rule under headers, a 2px ink rule closing a status block. Shadows exist only for objects that are physically a separate sheet or float above the page.

### Shadow Vocabulary
- **Document page** (`box-shadow: 0 1px 2px rgba(34, 33, 42, .08), 0 10px 28px -6px rgba(34, 33, 42, .10)`): the resume sheet, the report printout, the Home enquiry card, the interview pass, the printable resume preview.
- **Pop** (`box-shadow: 0 2px 4px rgba(34, 33, 42, .08), 0 16px 40px -8px rgba(34, 33, 42, .22)`): dialogs, toasts, the self-view camera tile.

### Named Rules
**The Paper Only Rule.** A shadow means "this is a sheet of paper" or "this is floating". Panels, cards, strips and tables stay flat with a hairline border.

## Shapes

Square-ish and clerical. Controls, panels and dialogs use 4px corners; chips, pins, tags and the document sheet use 2px; report bands and code blocks 3px; only the interviewer stage tile reaches 6px. Circles are reserved for the mic button, station markers, loading dots and level meters. Borders are 1px hairlines; ink rules are 1px under headers and 2px under status blocks and the intake side. The report uses a dashed perforation rule between its header band and body. Margin pins connect to their resume line with a one-pixel leader.

## Components

### Buttons
Plain and decisive: ink on paper.
- **Shape:** gently squared (4px), minimum 40px tall; sm 32px, lg 48px.
- **Primary:** ink fill, white text, Anek Latin 600 15px, 8px 16px padding; hover lifts to ink-hover; active nudges down 1px.
- **Secondary:** white sheet with control-rule border; hover darkens the border to ink.
- **Ghost:** transparent; hover fills with bar-2.
- **Danger:** white with waitlist-red border and text; hover fills red.
- **End interview:** solid waitlist red in the room top bar, separated from the other tools by 22px.
- **Disabled:** 45% opacity, no pointer events.

### Status Code (signature)
The PNR status is the system's signature.
- **Status block:** large Doto code in its status ink on the left; on the right a bold 20px heading that carries the context (for example "Backend Developer: 9 items from confirmed"), a 15px ink-2 line, and the trail (WL 9 to CNF) in Doto 700/900. Closed by a 2px ink rule. No label sits above the code.
- **Chip:** Doto 900 13px white on the status ink, 2px corners; idle chips use ink-3. Toasts lead with a chip.
- **Tick:** when a count changes, the code steps down one value at a time with a three-step opacity flicker (0.45s, steps(3)); the fixed row flashes cnf-bg for 2.6s.
- **Grammar:** open items counted; 0 is CNF, 1 to 3 is RAC n, more is WL n.

### Score Strip
A row of six equal cells on white with hairline dividers; each cell has a 13px ink-2 name over a Doto 32px numeral. The overall cell is inverted (ink fill, white numeral). A low score turns its numeral waitlist red.

### Chart Table (green bar)
- **Header:** rule label caps over a 1px ink rule.
- **Rows:** alternate paper-2 and bar; 1px hairline between; 11px 12px cell padding.
- **Columns:** line ID in mono 600 13px; content with a bold title and an ink-2 sub-line; right-aligned status in Doto 900 15px.
- **Current row:** 2px coach-blue outline inset; clickable rows hover to coach-wash.

### Resume Sheet and Margin Pins
White sheet with page shadow; each line is a grid of text plus a 76px margin. Lines with findings get a highlight (hl-wl or hl-rac), a one-pixel leader across to the margin, and a mono 700 11px pin carrying the line ID on the status ink (ink-3 for optional).

### Inputs / Fields
- **Style:** white, control-rule 1px border, 4px corners, 40px minimum height, 15px text; label 14px 600 above.
- **Focus:** border turns coach blue with a 3px coach ring at 18% opacity.
- **Segmented control:** joined buttons on white; the pressed segment fills ink.

### Option Cards and Personas
White cards with control-rule border; hover darkens the border to ink; the selected card gets a coach-blue border, a 1px inset coach line and coach-wash fill.

### Navigation
- **Rail:** coach blue, white-tinted (coach-ink-2) 16px items with 19px icons; hover fills coach-2 in white text. The current page becomes a paper tab bleeding into the work area, coach-blue 700 text. Optional status tag in Doto on the right.
- **Tabs:** 15px ink-2; selected is ink 700 with a 3px coach-blue underline; counts in mono.
- **Mobile:** rail collapses to a top bar; menu opens the nav and privacy foot full-width.

### Ticker
Loading state: JetBrains Mono 700 14px caps with 0.08em tracking, followed by four 6px dots that pulse in sequence. Used wherever the app waits on analysis.

### Interviewer Tile
Palette-bound illustrated or photo bust on a pale blue tile (#DCE4F2 with a #C9D5EA floor band), name plate bottom-left on 86% ink, a Doto state tag top-left (coach for speaking, waitlist red for listening), self-view inset bottom-right with pop shadow, captions below in ink at 18px.

## Do's and Don'ts

### Do:
- **Do** derive every status from the open-item count: 0 is CNF, 1 to 3 is RAC n, more is WL n.
- **Do** put the context for a status code in the heading beside it, not in a label above it.
- **Do** keep primary buttons ink (#22212A per the ink token); one primary per head row.
- **Do** mark the current tab, row, round, question and selected option in coach blue, and nothing else outside the rail.
- **Do** stripe data rows paper-2 and bar, with mono line IDs on the left and Doto statuses on the right.
- **Do** close status blocks and section heads with ink rules (2px and 1px) instead of boxing them.
- **Do** give every voice action a typed alternative and keep the reduced-motion override that collapses the tick, flash and ticker.

### Don't:
- **Don't** set words, labels, buttons or headings in Doto.
- **Don't** put an eyebrow or kicker label above a status code or heading.
- **Don't** use cnf, rac or wl colours on anything that is not a status, test result, recording state or destructive action.
- **Don't** fill primary buttons coach blue.
- **Don't** add shadows to panels, cards or tables; only documents and floating layers carry them.
- **Don't** show a score ring or a bare number without the line or item it comes from.
- **Don't** introduce corners above 6px or pill shapes on controls.
