#!/usr/bin/env python3
"""Refresh src/data/neighborhoods.json from the City of Atlanta's official Neighborhoods layer.

Source: City of Atlanta Department of City Planning, OpenDataService1, layer 3 "Neighborhoods".
Only the 11 neighborhoods the app knows (src/lib/api/types.ts `Neighborhood`) are kept, in
WGS84 (lat/lng) and lightly simplified so the file stays small enough to bundle.

    python3 scripts/fetch-neighborhoods.py
"""
import datetime
import json
import os
import urllib.parse
import urllib.request

LAYER = "https://gis.atlantaga.gov/dpcd/rest/services/OpenDataService1/FeatureServer/3"
# City name → app enum value (docs/data-model.md, Neighborhoods).
NAMES = {
    "English Avenue": "english_avenue",
    "Vine City": "vine_city",
    "Hunter Hills": "hunter_hills",
    "Washington Park": "washington_park",
    "Historic Westin Heights/Bankhead": "bankhead",
    "Knight Park/Howell Station": "knight_park",
    "Dixie Hills": "dixie_hills",
    "West Lake": "west_lake",
    "Center Hill": "center_hill",
    "Harvel Homes Community": "harvel_homes",
    "Georgia Tech": "georgia_tech",
}
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "neighborhoods.json")


def main():
    where = "NAME IN (" + ",".join(f"'{n}'" for n in NAMES) + ")"
    query = urllib.parse.urlencode(
        {
            "where": where,
            "outFields": "NAME,NPU",
            "returnGeometry": "true",
            "outSR": "4326",
            "maxAllowableOffset": "0.00003",  # ~3 m
            "geometryPrecision": "6",
            "f": "geojson",
        }
    )
    data = json.load(urllib.request.urlopen(f"{LAYER}/query?{query}", timeout=60))
    features = [
        {
            "type": "Feature",
            "properties": {
                "id": NAMES[f["properties"]["NAME"]],
                "name": f["properties"]["NAME"],
                "npu": f["properties"]["NPU"],
            },
            "geometry": f["geometry"],
        }
        for f in data["features"]
    ]
    missing = set(NAMES.values()) - {f["properties"]["id"] for f in features}
    if missing:
        raise SystemExit(f"Missing from the City layer: {sorted(missing)}")
    out = {
        "type": "FeatureCollection",
        "source": f'City of Atlanta Department of City Planning, OpenDataService1 layer 3 "Neighborhoods" ({LAYER})',
        "retrieved": datetime.date.today().isoformat(),
        "note": "Simplified (maxAllowableOffset 0.00003 deg, ~3 m). Refresh with scripts/fetch-neighborhoods.py.",
        "features": sorted(features, key=lambda f: f["properties"]["id"]),
    }
    with open(OUT, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"Wrote {len(features)} neighborhoods to {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
