"""Assert that a /api/tv/refresh response actually describes a real ingest.

A 200 alone is not proof: if the route changed shape, or a provider failed
upstream, the status line would still be green. This turns the response body
into a pass/fail that names what went wrong.

Usage: python3 scripts/check_tv_refresh.py <response.json>
"""
import json
import sys

UPSTREAM_FAILURES = ("auth_failed", "rate_limited", "upstream_failed")
CONFIG_GAPS = ("missing_key", "not_configured")


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/out.json"
    try:
        with open(path, encoding="utf-8") as fh:
            body = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"::error::Could not read a JSON body from {path}: {exc}")
        return 1

    missing = [k for k in ("tvmaze", "tvmedia") if k not in body]
    if missing:
        print(f"::error::Response is missing provider result(s): {', '.join(missing)}")
        return 1

    tvmaze = body["tvmaze"]
    tvmedia = body["tvmedia"]
    status = tvmedia.get("status")

    print(f"tvmaze  ran={tvmaze.get('ran')} reason={tvmaze.get('reason', '-')}")
    print(
        f"tvmedia ran={tvmedia.get('ran')} status={status} "
        f"listings={tvmedia.get('totalListingsFetched')} "
        f"inserted={tvmedia.get('inserted')} coverage_end={tvmedia.get('windowEndUtc')}"
    )

    # A gated no-op between windows is the normal, healthy case. A provider
    # that actually failed upstream is not, and must not pass as green.
    if status in UPSTREAM_FAILURES:
        print(f"::error::TV Media reported {status} — the provider is failing, not the trigger.")
        return 1
    if status in CONFIG_GAPS:
        print(f"::warning::TV Media is {status}; Hallmark coverage depends on it.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
