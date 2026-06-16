#!/usr/bin/env python3
"""
Fetch NBA team rosters via nba_api (1996–2014 gap fill).
Requires: python3 -m venv .venv && .venv/bin/pip install nba_api

Run: .venv/bin/python scripts/fetch-nba-rosters.py
Output: data/dynasty/raw/nba-api-rosters.json
"""

import json
import re
import time
from pathlib import Path

from nba_api.stats.endpoints import commonteamroster
from nba_api.stats.static import teams as nba_teams

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "dynasty" / "raw" / "nba-api-rosters.json"

# NBA team id → DynastyDraft team id
TEAM_ID_MAP = {
    1610612737: "hawks",
    1610612738: "celtics",
    1610612751: "nets",
    1610612766: "hornets",
    1610612741: "bulls",
    1610612739: "cavaliers",
    1610612742: "mavericks",
    1610612743: "nuggets",
    1610612765: "pistons",
    1610612744: "warriors",
    1610612745: "rockets",
    1610612754: "pacers",
    1610612746: "clippers",
    1610612747: "lakers",
    1610612763: "grizzlies",
    1610612748: "heat",
    1610612749: "bucks",
    1610612750: "timberwolves",
    1610612740: "pelicans",
    1610612752: "knicks",
    1610612760: "thunder",
    1610612753: "magic",
    1610612755: "76ers",
    1610612756: "suns",
    1610612757: "blazers",
    1610612758: "kings",
    1610612759: "spurs",
    1610612761: "raptors",
    1610612762: "jazz",
    1610612764: "wizards",
    # Historical franchise ids still on stats.nba.com
    1610612740: "pelicans",  # NO Hornets
    1610612760: "thunder",    # Seattle
    1610612746: "clippers",
    1610612766: "hornets",    # CHA / Bobcats
}

# Bobcats era used different id before rename
BOBCATS_ID = 1610612766
HORNETS_NO_ID = 1610612740

POSITION_MAP = {
    "G": ["PG", "SG"],
    "F": ["SF", "PF"],
    "C": ["C"],
    "G-F": ["SG", "SF"],
    "F-G": ["SF", "SG"],
    "F-C": ["PF", "C"],
    "C-F": ["C", "PF"],
}


def slug(name: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))


def parse_positions(raw: str):
    raw = (raw or "F").strip().upper()
    if raw in POSITION_MAP:
        return POSITION_MAP[raw]
    out = []
    for ch in raw.replace("-", ""):
        if ch == "G" and "PG" not in out:
            out.extend(["PG", "SG"])
        elif ch == "F" and "SF" not in out:
            out.extend(["SF", "PF"])
        elif ch == "C" and "C" not in out:
            out.append("C")
    return out or ["SF"]


def dynasty_team_id(nba_id: int, season_label: str):
    # Charlotte Bobcats 2004–2014
    if nba_id == BOBCATS_ID and season_label >= "2004-05" and season_label <= "2013-14":
        return "hornets"
    # New Orleans Hornets → Pelicans from 2013-14
    if nba_id == HORNETS_NO_ID and season_label >= "2002-03":
        if season_label >= "2013-14":
            return "pelicans"
        return "pelicans"
    # Seattle SuperSonics through 2007-08
    if nba_id == 1610612760 and season_label <= "2007-08":
        return "thunder"
    return TEAM_ID_MAP.get(nba_id)


def season_labels(start_end_year: int, end_end_year: int):
    for y in range(start_end_year, end_end_year + 1):
        yield y, f"{y - 1}-{str(y)[-2:]}"


def default_ratings(positions):
    primary = positions[0]
    base = 66
    if primary in ("PG", "SG"):
        return {
            "scoring": base + 2,
            "shooting": base + 1,
            "defense": base - 2,
            "playmaking": base + 2,
            "rebounding": base - 6,
            "health": 82,
            "impact": base,
        }
    if primary == "C":
        return {
            "scoring": base - 2,
            "shooting": base - 4,
            "defense": base + 4,
            "playmaking": base - 4,
            "rebounding": base + 6,
            "health": 82,
            "impact": base,
        }
    return {
        "scoring": base,
        "shooting": base,
        "defense": base,
        "playmaking": base - 2,
        "rebounding": base,
        "health": 82,
        "impact": base,
    }


def fetch():
    active = [t for t in nba_teams.get_teams() if t["id"] in TEAM_ID_MAP or t["id"] in (BOBCATS_ID, HORNETS_NO_ID, 1610612760)]
    # Use full static list for historical fetches
    all_teams = nba_teams.get_teams()
    players = []
    seen = set()

    for end_year, label in season_labels(1997, 2014):
        print(f"Season {label}…", flush=True)
        for team in all_teams:
            team_id = dynasty_team_id(team["id"], label)
            if not team_id:
                continue
            try:
                roster = commonteamroster.CommonTeamRoster(team_id=team["id"], season=label)
                df = roster.get_data_frames()[0]
            except Exception as exc:
                print(f"  skip {team['abbreviation']} {label}: {exc}", flush=True)
                time.sleep(0.6)
                continue

            for _, row in df.iterrows():
                name = row.get("PLAYER")
                if not name:
                    continue
                key = (name.lower(), team_id, end_year)
                if key in seen:
                    continue
                seen.add(key)
                positions = parse_positions(str(row.get("POSITION", "F")))
                ratings = default_ratings(positions)
                players.append(
                    {
                        "id": f"{slug(name)}-{team_id}-{end_year}",
                        "name": name,
                        "teamId": team_id,
                        "year": end_year,
                        "age": 26,
                        "experience": 4,
                        "positions": positions,
                        "primaryPosition": positions[0],
                        "allStar": False,
                        "ratings": ratings,
                        "source": "nba-api",
                    }
                )
            time.sleep(0.6)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "nba_api",
        "players": players,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"\nWrote {len(players)} rows → {OUT}")


if __name__ == "__main__":
    fetch()
