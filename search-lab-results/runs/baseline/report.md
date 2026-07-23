# Search Lab — baseline

- total: 8 · passed: 1 · failed: 7
- critical: seedLeak=2 duplicate=0 contradictionLeak=12 hallucination=0
- franchise-cap violations: 3 · genuine-match recall misses: 8

## Cases

- FAIL `rocky.default` (dev) returned 5/5 · CONTRADICTION edward-scissorhands-1990,the-shape-of-water-2017,la-la-land-2016 · FRANCHISE 2 · missing creed-2015,the-fighter-2010,warrior-2011
- FAIL `rocky.underdog` (dev) returned 5/5 · CONTRADICTION edward-scissorhands-1990,la-la-land-2016 · FRANCHISE 2 · missing rudy-1993,creed-2015
- FAIL `rocky.no_sequels` (dev) returned 5/5 · SEED-LEAK rocky-ii,rocky-iv · CONTRADICTION edward-scissorhands-1990 · FRANCHISE 2 · missing creed-2015,the-fighter-2010
- FAIL `rocky.include_franchise` (dev) returned 5/5 · CONTRADICTION edward-scissorhands-1990 · missing creed-2015
- PASS `rocky.where_to_watch` (dev) returned 1/5
- FAIL `rocky.zero_qualified` (dev) returned 3/5 · CONTRADICTION edward-scissorhands-1990,the-shape-of-water-2017,la-la-land-2016
- FAIL `jaws.default` (holdout) returned 3/5 · CONTRADICTION finding-nemo-2003
- FAIL `groundhog.default` (holdout) returned 3/5 · CONTRADICTION triangle-2009
