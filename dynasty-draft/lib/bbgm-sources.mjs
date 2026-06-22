/** Shared BBGM file lists for import + rerate scripts */

export const BBGM_BASE =
  "https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master";

/** Season snapshot files — full ~12–15 man rosters per team */
export const SNAPSHOT_FILES = [
  "1995-96.NBA.Roster.json",
  "2009-10 Rosters.json",
  "2015-16.NBA.Roster.json",
  "2016-17.NBA.Roster.json",
  "2017-18.NBA.Roster.json",
  "2018-19.NBA.Roster.json",
  "2019-20.NBA.Roster.json",
  "2020-21.NBA.Roster.json",
  "2021-22.NBA.Roster.json",
  "2022-23.NBA.Roster.json",
  "2023-24.NBA.Roster.json",
  "2024-25.NBA.Roster.json",
  "2025-26.NBA.Roster.json",
  "NBA Legacy 1985 23 teams.json",
];

/** Mega files — career stats + ratings history */
export const MEGA_FILES = [
  "2019-20.NBA.Roster.json",
  "2020-21.NBA.Roster.json",
  "2021-22.NBA.Roster.json",
  "2022-23.NBA.Roster.json",
  "2023-24.NBA.Roster.json",
  "2024-25.NBA.Roster.json",
  "2025-26.NBA.Roster.json",
];

export function bbgmCacheName(name) {
  return name.replace(/[^\w.-]+/g, "_");
}
