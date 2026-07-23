# Search Lab — Threshold Calibration Sweep

Grid points swept: **450** · eligible (0 critical leaks & 0 over-filtering): **15**

## Metric ranges across the full grid (CALIBRATION)

- precision: 0.792 … 1
- recall: 0.895 … 1
- falseQualificationRate: 0 … 0.313
- noResultRate: 0 … 0.111
- criticalContradictionRate: 0 … 0.286
- f1: 0.872 … 0.944

## Selected configuration

```json
{
  "version": "sweep-candidate",
  "minAnchor": 0.4,
  "maxContradiction": 0.42,
  "hardRealismGap": 40,
  "minConfidence": 0.4,
  "defaultFranchiseCap": 1
}
```

Chosen among 15 configs with zero critical-contradiction leaks; max F1=0.944, tie-broken by false-qualification, then no-result rate, then closeness to provisional.

## CALIBRATION split

- provisional: precision=0.85 recall=0.895 F1=0.872 falseQual=0.188 noResult=0.111 critContra=0.214 (TP17/FP3/FN2/TN13)
- selected:    precision=1 recall=0.895 F1=0.944 falseQual=0 noResult=0.111 critContra=0 (TP17/FP0/FN2/TN16)

## HOLDOUT split (scored ONCE with the frozen selection)

- provisional: precision=1 recall=1 F1=1 falseQual=0 noResult=0 critContra=0 (TP5/FP0/FN0/TN9)
- selected:    precision=1 recall=1 F1=1 falseQual=0 noResult=0 critContra=0 (TP5/FP0/FN0/TN9)

## Composition

- CALIBRATION: 35 pairs · 21 distinct seeds
- HOLDOUT: 14 pairs · 14 distinct seeds
- calibration by category: {"positive":17,"contradiction":14,"borderline":1,"franchise":1,"broad_similarity":2}
- calibration by bucket: {"sports":4,"crime":2,"thriller":2,"scifi_horror":2,"prison_drama":1,"romcom":2,"superhero":2,"heist":2,"timeloop":2,"war":2,"western":1,"coming_of_age":1,"action":1,"music_drama":1,"tv_crime":2,"tv_prestige":1,"spanish":2,"east_asian":2,"french":2,"documentary":1}

