# Told own-words change report

Date: 2026-10-19  
Approval: Jesse, 2026-10-19

## What changed

- Added and exported the pure `outletOwnWords(version)` helper. It returns only `{ headline, opening }`.
- `opening` now comes from the first two surviving sentences of article text, or description when text is absent. Quoted passages are replaced with `[quote]` before sentence counting. Straight and curly double-quoted passages are always stripped; straight and curly single-quoted passages are stripped at three or more words, preserving apostrophes such as `Australia's`, `Australia’s`, `don't`, and `don’t`.
- Sentences matching the existing speech, claim, court, testimony, allegation, or prosecution attribution checks are removed in full before the two opening sentences are selected.
- Headlines retain their non-quoted wording while quoted passages are replaced with `[quote]`.
- `toldUserPrompt` now emits only `HEADLINE` and `OPENING` for each outlet; the former `DESCRIPTION` and `TEXT` fields are gone.
- `buildTold` now accepts a stance quote only when it occurs in that outlet's same stripped headline/opening surface. The existing attribution rejection, allegation-to-plain conversion, all-plain subject removal, and slashed-subject rejection remain in place.
- `TOLD_SYSTEM_PROMPT` now states that the model receives quote-stripped headline/opening material and must judge the outlet's own wording and lead choices.

## Failing-first evidence

Before the implementation, the new focused test was run with:

```text
node --test test/writer-told-own-words.test.js
```

Result:

```text
tests 5
pass 1
fail 4
```

The first three failures reported `TypeError: outletOwnWords is not a function`; the prompt-contract test also failed because the old system prompt did not mention the headline/opening-only, quotes-removed input. The one initial pass was the pre-existing attribution validator independently rejecting the attributed ABC sentence.

After implementation and the additional quote-style coverage:

```text
node --test test/writer-told-own-words.test.js
tests 6
pass 6
fail 0
```

Final full suite:

```text
npm test
tests 313
suites 35
pass 313
fail 0
```

`git diff --check` also completed cleanly.

## Material shown to the model in the regression cases

The regression fixtures include enough following copy to demonstrate that filtering happens before the first two surviving sentences are selected.

### ABC attributed quotation

Input includes: `As the occupying power, "Israeli authorities must protect Palestinians", the minister said.`

```text
HEADLINE: Minister responds to attacks on Palestinian olive harvest
OPENING: Officials discussed the attacks overnight. Harvesting resumed on Monday.
```

The entire attributed sentence is absent, including the unquoted prefix. A stance citing `As the occupying power` is rejected by `buildTold` because those words are not in the shown headline/opening.

### Guardian unattributed opening

```text
HEADLINE: Settlers attack diplomats during Palestinian olive harvest
OPENING: Settlers attacked the diplomats in the latest violent attempt to prevent Palestinians from harvesting olives on their own land. Diplomats returned to the area later.
```

The supplied Guardian sentence is unchanged because it contains neither a quoted passage nor attributed speech.

### Quoted headline and apostrophes

```text
HEADLINE: [quote]: Katie Zacharia breaks silence after White House firing
OPENING: Australia's officials don't expect delays. Travellers won't need new documents.
```

The three-word single-quoted headline passage is replaced, while the straight apostrophes remain intact. A companion regression also verifies curly apostrophes and both straight/curly quotation forms.
