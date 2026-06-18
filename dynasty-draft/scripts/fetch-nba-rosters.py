#!/usr/bin/env python3
"""
Fetch every NBA team roster (1970–2024) via nba_api with stat-based ratings.
Requires: .venv/bin/pip install nba_api

Run: .venv/bin/python scripts/fetch-nba-rosters.py
      .venv/bin/python scripts/fetch-nba-rosters.py --from 1977 --to 1996  (partial)
Output: data/dynasty/raw/nba-api-rosters.json
"""

import argparse
import json
import re
import time
import unicodedata
from pathlib import Path

from nba_api.stats.endpoints import commonteamroster, leaguedashplayerstats
from nba_api.stats.static import teams as nba_teams

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "dynasty" / "raw" / "nba-api-rosters.json"

ABBREV_TO_ID = {
    "ATL": "hawks",
    "BOS": "celtics",
    "BKN": "nets",
    "NJN": "nets",
    "BRK": "nets",
    "CHA": "hornets",
    "CHI": "bulls",
    "CLE": "cavaliers",
    "DAL": "mavericks",
    "DEN": "nuggets",
    "DET": "pistons",
    "GSW": "warriors",
    "HOU": "rockets",
    "IND": "pacers",
    "LAC": "clippers",
    "LAL": "lakers",
    "MEM": "grizzlies",
    "MIA": "heat",
    "MIL": "bucks",
    "MIN": "timberwolves",
    "NOP": "pelicans",
    "NOH": "pelicans",
    "NYK": "knicks",
    "OKC": "thunder",
    "SEA": "thunder",
    "ORL": "magic",
    "PHI": "76ers",
    "PHX": "suns",
    "POR": "blazers",
    "SAC": "kings",
    "SAS": "spurs",
    "TOR": "raptors",
    "UTA": "jazz",
    "WAS": "wizards",
    "WSB": "wizards",
}

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


def norm_name(name: str) -> str:
    name = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z ]", "", name.lower()).strip()


def parse_positions(raw: str):
    raw = (raw or "F").strip().upper()
    if raw in POSITION_MAP:
        return POSITION_MAP[raw]
    out = []
    for ch in raw.replace("-", ""):
        if ch == "G":
            out.extend(["PG", "SG"])
        elif ch == "F":
            out.extend(["SF", "PF"])
        elif ch == "C":
            out.append("C")
    return list(dict.fromkeys(out)) or ["SF"]


def clamp(n, lo, hi):
    return max(lo, min(hi, n))


def scale(val, lo, hi, out_lo=40, out_hi=99):
    if hi <= lo:
        return round((out_lo + out_hi) / 2)
    t = (val - lo) / (hi - lo)
    return clamp(round(out_lo + t * (out_hi - out_lo)), out_lo, out_hi)


def rate_anchors(value, anchors):
    if value is None or value != value:
        return anchors[0][1]
    if value <= anchors[0][0]:
        return anchors[0][1]
    for i in range(1, len(anchors)):
        x0, y0 = anchors[i - 1]
        x1, y1 = anchors[i]
        if value <= x1:
            t = (value - x0) / (x1 - x0)
            return clamp(round(y0 + t * (y1 - y0)), 40, 99)
    return anchors[-1][1]


def ratings_from_stats(row, positions):
    gp = max(1, float(row.get("GP") or 1))
    pts = float(row.get("PTS") or 0)
    reb = float(row.get("REB") or 0)
    ast = float(row.get("AST") or 0)
    stl = float(row.get("STL") or 0)
    blk = float(row.get("BLK") or 0)
    fg_pct = float(row.get("FG_PCT") or 0.45)
    fg3_pct = float(row.get("FG3_PCT") or 0)
    ft_pct = float(row.get("FT_PCT") or 0.75)
    mins = float(row.get("MIN") or gp * 20) / gp

    scoring = rate_anchors(pts, [
        (0, 40), (5, 50), (10, 62), (15, 72), (18, 78), (22, 85),
        (25, 90), (28, 94), (32, 97), (36, 99),
    ])
    shooting_blend = fg_pct * 0.55 + fg3_pct * 0.25 + ft_pct * 0.2
    shooting = rate_anchors(shooting_blend, [
        (0.4, 45), (0.48, 58), (0.54, 72), (0.58, 82), (0.62, 90), (0.66, 96), (0.7, 99),
    ])
    playmaking = rate_anchors(ast, [
        (0, 40), (1, 52), (3, 65), (5, 75), (7, 85), (9, 92), (11, 97), (13, 99),
    ])
    rebounding = rate_anchors(reb, [
        (0, 40), (2, 52), (4, 62), (6, 72), (8, 82), (10, 90), (12, 95), (14, 99),
    ])
    stocks = stl * 2.1 + blk * 2.4
    defense = rate_anchors(stocks, [
        (0, 40), (0.5, 52), (1.2, 65), (2, 75), (2.8, 85), (3.5, 92), (4.5, 97), (5.5, 99),
    ])
    health = rate_anchors(min(gp, 82), [
        (20, 55), (40, 65), (55, 72), (65, 78), (72, 85), (78, 92), (82, 99),
    ])
    usage = rate_anchors(mins, [(10, 40), (20, 55), (28, 70), (34, 82), (38, 92)])
    impact = clamp(
        round(scoring * 0.28 + shooting * 0.1 + defense * 0.2 + playmaking * 0.16 + rebounding * 0.14 + usage * 0.12),
        40,
        99,
    )

    pos = positions[0]
    if pos in ("C", "PF"):
        defense = clamp(defense + 2, 40, 99)
        rebounding = clamp(rebounding + 3, 40, 99)
    elif pos == "PG":
        playmaking = clamp(playmaking + 3, 40, 99)
        rebounding = clamp(rebounding - 3, 40, 99)
    elif pos == "SG":
        shooting = clamp(shooting + 1, 40, 99)

    return {
        "scoring": scoring,
        "shooting": shooting,
        "defense": defense,
        "playmaking": playmaking,
        "rebounding": rebounding,
        "health": health,
        "impact": impact,
    }


def default_ratings(positions):
    pos = positions[0]
    base = 66
    if pos in ("PG", "SG"):
        return {
            "scoring": base + 2,
            "shooting": base + 1,
            "defense": base - 2,
            "playmaking": base + 2,
            "rebounding": base - 6,
            "health": 82,
            "impact": base,
        }
    if pos == "C":
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


def season_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def fetch_season_stats(end_year: int):
    if end_year < 2000:
        return {}
    try:
        resp = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season_label(end_year), per_mode_detailed="PerGame"
        )
        df = resp.get_data_frames()[0]
    except Exception as exc:
        print(f"    stats unavailable {end_year}: {exc}", flush=True)
        return {}

    lookup = {}
    for _, row in df.iterrows():
        abbr = str(row.get("TEAM_ABBREVIATION") or "").upper()
        key = (norm_name(str(row.get("PLAYER_NAME") or "")), abbr)
        lookup[key] = row.to_dict()
    return lookup


def fetch():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="from_year", type=int, default=1970)
    parser.add_argument("--to", dest="to_year", type=int, default=2024)
    args = parser.parse_args()

    teams = nba_teams.get_teams()
    players = []
    seen = set()

    for end_year in range(args.from_year, args.to_year + 1):
        label = season_label(end_year)
        print(f"Season {label} (year {end_year})…", flush=True)
        stats_lookup = fetch_season_stats(end_year)
        time.sleep(0.6)

        season_count = 0
        for team in teams:
            nba_id = team["id"]
            try:
                roster = commonteamroster.CommonTeamRoster(team_id=nba_id, season=label)
                df = roster.get_data_frames()[0]
            except Exception:
                time.sleep(0.4)
                continue

            if df.empty:
                time.sleep(0.35)
                continue

            abbr = str(team.get("abbreviation") or "").upper()
            team_id = ABBREV_TO_ID.get(abbr)
            if not team_id:
                time.sleep(0.35)
                continue

            for _, row in df.iterrows():
                name = str(row.get("PLAYER") or "").strip()
                if not name:
                    continue
                key = (norm_name(name), team_id, end_year)
                if key in seen:
                    continue
                seen.add(key)

                positions = parse_positions(str(row.get("POSITION") or "F"))
                stat_row = stats_lookup.get((norm_name(name), abbr))
                ratings = (
                    ratings_from_stats(stat_row, positions)
                    if stat_row
                    else default_ratings(positions)
                )

                age_raw = row.get("AGE")
                age = int(float(age_raw)) if age_raw not in (None, "") else 25

                players.append(
                    {
                        "id": f"{slug(name)}-{team_id}-{end_year}",
                        "name": name,
                        "teamId": team_id,
                        "year": end_year,
                        "age": age,
                        "experience": 4,
                        "positions": positions,
                        "primaryPosition": positions[0],
                        "allStar": False,
                        "ratings": ratings,
                        "source": "nba-api",
                    }
                )
                season_count += 1

            time.sleep(0.45)

        print(f"  → {season_count} players", flush=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "nba_api",
        "yearRange": [args.from_year, args.to_year],
        "players": players,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"\nWrote {len(players)} rows → {OUT}", flush=True)


if __name__ == "__main__":
    fetch()
