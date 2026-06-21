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

from nba_api.stats.endpoints import commonteamroster, leaguedashplayerstats, playercareerstats
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


def parse_height(raw):
    if raw in (None, ""):
        return None
    text = str(raw).strip()
    match = re.match(r"^(\d+)\s*[-']\s*(\d+)$", text)
    if match:
        return int(match.group(1)) * 12 + int(match.group(2))
    try:
        value = int(float(text))
        return value if value > 0 else None
    except (TypeError, ValueError):
        return None


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


def normalize_stat_row(row):
    gp = max(1, float(row.get("GP") or 1))
    pts = float(row.get("PTS") or 0)
    if pts <= gp * 4:
        return row
    return {
        **row,
        "GP": gp,
        "PTS": pts / gp,
        "REB": float(row.get("REB") or 0) / gp,
        "AST": float(row.get("AST") or 0) / gp,
        "STL": float(row.get("STL") or 0) / gp,
        "BLK": float(row.get("BLK") or 0) / gp,
        "MIN": float(row.get("MIN") or gp * 20) / gp,
    }


def ratings_from_stats(row, positions):
    row = normalize_stat_row(row)
    gp = max(1, float(row.get("GP") or 1))
    pts = float(row.get("PTS") or 0)
    reb = float(row.get("REB") or 0)
    ast = float(row.get("AST") or 0)
    stl = float(row.get("STL") or 0)
    blk = float(row.get("BLK") or 0)
    fg = float(row.get("FG") or 0)
    fga = float(row.get("FGA") or 0)
    tp = float(row.get("FG3") or 0)
    tpa = float(row.get("FG3A") or 0)
    ft = float(row.get("FT") or 0)
    fta = float(row.get("FTA") or 0)
    fg_pct = float(row.get("FG_PCT") or (fg / fga if fga else 0.45))
    fg3_pct = float(row.get("FG3_PCT") or (tp / tpa if tpa else 0))
    ft_pct = float(row.get("FT_PCT") or (ft / fta if fta else 0.75))
    mins = float(row.get("MIN") or gp * 20) / gp
    ts_attempts = fga + 0.44 * fta
    ts_pct = (fg * 2 + tp + ft) / (2 * ts_attempts) if ts_attempts else fg_pct
    efg_pct = (fg + 0.5 * tp) / fga if fga else fg_pct
    tpa_pg = tpa / gp
    tpm_pg = tp / gp

    scoring = rate_anchors(pts, [
        (0, 40), (5, 50), (10, 62), (15, 72), (18, 78), (22, 85),
        (25, 90), (28, 94), (32, 97), (36, 99),
    ])
    shooting_blend = ts_pct * 0.5 + efg_pct * 0.2 + fg3_pct * 0.18 + ft_pct * 0.12
    if tpa_pg >= 5 and fg3_pct >= 0.355:
        shooting_blend += 0.02
    if tpa_pg >= 7 and fg3_pct >= 0.36:
        shooting_blend += 0.025
    if tpa_pg >= 9 and fg3_pct >= 0.38:
        shooting_blend += 0.025
    if tpm_pg >= 3 and fg3_pct >= 0.37:
        shooting_blend += 0.02
    if tpm_pg >= 4 and fg3_pct >= 0.39:
        shooting_blend += 0.03
    shooting = rate_anchors(shooting_blend, [
        (0.4, 45), (0.48, 58), (0.52, 68), (0.56, 78), (0.58, 84),
        (0.62, 90), (0.66, 95), (0.7, 99),
    ])
    playmaking = rate_anchors(ast, [
        (0, 40), (1, 52), (3, 65), (5, 75), (7, 85), (9, 92), (11, 97), (13, 99),
    ])
    rebounding = rate_anchors(reb, [
        (0, 40), (2, 52), (4, 62), (6, 72), (8, 82), (10, 90), (12, 95), (14, 99),
    ])
    stocks = stl * 1.35 + blk * 1.75
    defense = rate_anchors(stocks, [
        (0, 40), (0.5, 52), (1.0, 60), (1.6, 68), (2.2, 76), (2.8, 84),
        (3.5, 91), (4.5, 97), (5.5, 99),
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
    if pos in ("PG", "SG"):
        if stocks < 2.4:
            defense = min(defense, 74)
        elif stocks < 3.6:
            defense = min(defense, 78)
    elif pos == "SF" and stocks < 2.6:
        defense = min(defense, 84)
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


CAREER_FRAMES = {}


def career_stat_row(player_id, end_year: int):
    pid = int(player_id)
    if pid not in CAREER_FRAMES:
        try:
            CAREER_FRAMES[pid] = playercareerstats.PlayerCareerStats(player_id=pid).get_data_frames()[0]
            time.sleep(0.55)
        except Exception:
            CAREER_FRAMES[pid] = None
    frame = CAREER_FRAMES[pid]
    if frame is None or frame.empty:
        return None
    sid = season_label(end_year)
    rows = frame[frame["SEASON_ID"] == sid]
    if rows.empty:
        return None
    return rows.iloc[0].to_dict()


def resolve_stat_row(player_id, end_year: int, stats_lookup, name: str, abbr: str):
    stat_row = stats_lookup.get((norm_name(name), abbr))
    if stat_row:
        return stat_row
    if player_id in (None, ""):
        return None
    return career_stat_row(player_id, end_year)


def fetch_season_stats(end_year: int):
    # LeagueDashPlayerStats only returns data from ~1999-00 onward.
    if end_year < 1999:
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
                player_id = row.get("PLAYER_ID")
                stat_row = resolve_stat_row(player_id, end_year, stats_lookup, name, abbr)
                ratings = (
                    ratings_from_stats(stat_row, positions)
                    if stat_row
                    else default_ratings(positions)
                )

                age_raw = row.get("AGE")
                age = int(float(age_raw)) if age_raw not in (None, "") else 25
                height = parse_height(row.get("HEIGHT"))

                row_payload = {
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
                if stat_row:
                    normalized = normalize_stat_row(stat_row)
                    gp = max(1, float(normalized.get("GP") or 1))
                    row_payload["stats"] = {
                        "GP": gp,
                        "PTS": float(normalized.get("PTS") or 0),
                        "REB": float(normalized.get("REB") or 0),
                        "AST": float(normalized.get("AST") or 0),
                        "STL": float(normalized.get("STL") or 0),
                        "BLK": float(normalized.get("BLK") or 0),
                        "FG_PCT": float(normalized.get("FG_PCT") or 0.45),
                        "FG3_PCT": float(normalized.get("FG3_PCT") or 0),
                        "FT_PCT": float(normalized.get("FT_PCT") or 0.75),
                        "MIN": float(normalized.get("MIN") or gp * 20),
                    }
                if height is not None:
                    row_payload["height"] = height

                players.append(row_payload)
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
