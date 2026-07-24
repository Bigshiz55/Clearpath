# Search Lab — Multilingual Clarification Benchmark

Cases: 1520 (20 curated adversarial + 1500 generated).

## Metrics by locale

| locale | n | intent | top3 | entityRes | clarPrec | clarRecall | unnecClar | noResult | recovery | langMismatch | untransl | avgConf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | 507 | 1 | 1 | 1 | 0.679 | 0.974 | 0.107 | 0 | 1 | 0 | 0 | 0.724 |
| es | 510 | 1 | 1 | 1 | 0.706 | 1 | 0.092 | 0 | 1 | 0 | 0 | 0.725 |
| fr | 2 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0.615 |
| de | 2 | 0.5 | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0.615 |
| pt | 2 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0.736 |
| ja | 2 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0.736 |
| ar | 2 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0.615 |
| zh | 493 | 1 | 1 | 1 | 0 | 0 | 0.13 | 0 | 1 | 0 | 0 | 0.727 |

## Regression vs English baseline: **NONE**


## Adversarial cases

- ✅ `en-rocky-coming` [en] expect live_tv_schedule → live_tv_schedule
- ✅ `en-where-sherlock` [en] expect streaming_lookup → streaming_lookup
- ✅ `en-new-batman` [en] expect upcoming_release → upcoming_release
- ✅ `es-rocky-viene` [es] expect live_tv_schedule → live_tv_schedule
- ✅ `es-donde-rocky` [es] expect streaming_lookup → streaming_lookup
- ✅ `es-algo-knives` [es] expect similar_to → similar_to
- ✅ `fr-rocky-passe` [fr] expect live_tv_schedule → live_tv_schedule
- ✅ `fr-ou-rocky` [fr] expect streaming_lookup → streaming_lookup
- ❌ `de-kommt-rocky` [de] expect upcoming_release → live_tv_schedule
- ✅ `de-wo-rocky` [de] expect streaming_lookup → streaming_lookup
- ✅ `pt-rocky-passar` [pt] expect live_tv_schedule → live_tv_schedule
- ✅ `pt-onde-rocky` [pt] expect streaming_lookup → streaming_lookup
- ✅ `ja-rocky-doko` [ja] expect streaming_lookup → streaming_lookup
- ✅ `ja-rocky-yaru` [ja] expect live_tv_schedule → live_tv_schedule
- ✅ `ar-ayn-rocky` [ar] expect streaming_lookup → streaming_lookup
- ✅ `ar-rocky-soon` [ar] expect live_tv_schedule → live_tv_schedule
- ✅ `en-casa-de-papel` [en] expect find_title → find_title
- ✅ `es-dark-knight` [es] expect find_title → find_title
- ✅ `en-train` [en] expect unknown → could_not_identify
- ✅ `en-detective` [en] expect unknown → could_not_identify

