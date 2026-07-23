# Search Lab — Identity & Resolution Audit

Cases: **52** across 17 categories.

## Metrics — before (legacy) vs after (fixed)

- legacy: acc=0.846 prec=0.839 rec=0.897 FPR=0.217 FNR=0.103 dangerousFP=5 noMatchAcc=0.545 exactAcc=1 franchiseIdAcc=0.867
- fixed:  acc=1 prec=1 rec=1 FPR=0 FNR=0 dangerousFP=0 noMatchAcc=1 exactAcc=1 franchiseIdAcc=0.933

## Confidence calibration by band (fixed)

- high: 100% correct (30/30), accepts=29
- mid: 100% correct (2/2), accepts=0
- low: 100% correct (20/20), accepts=0

## Behaviour changes (before → after)

- `intl-amelie` (international_title) "Amelie" expected=accept: accepts false→true · fixed a FALSE NEGATIVE
- `intl-amelie-accent` (international_title) "Amélie" expected=accept: accepts false→true · fixed a FALSE NEGATIVE
- `intl-ytu` (international_title) "Y Tu Mama Tambien" expected=accept: accepts false→true · fixed a FALSE NEGATIVE
- `wrong-saw-warsaw` (close_but_wrong) "Saw" expected=reject: accepts true→false · fixed a FALSE POSITIVE
- `wrong-ted-wanted` (close_but_wrong) "Ted" expected=reject: accepts true→false · fixed a FALSE POSITIVE
- `wrong-her-butcher` (close_but_wrong) "Her" expected=reject: accepts true→false · fixed a FALSE POSITIVE
- `wrong-ring-ringer` (close_but_wrong) "The Ring" expected=reject: accepts true→false · fixed a FALSE POSITIVE
- `wrong-cars-carsington` (close_but_wrong) "Cars" expected=reject: accepts true→false · fixed a FALSE POSITIVE
- `conflict-collections` (tmdb_conflict) "Same title, different franchises" expected=reject: accepts false→false · relation canonical_duplicate→similar

## Residual (fixed) — cases still not fully accepted where a human might expect nuance


