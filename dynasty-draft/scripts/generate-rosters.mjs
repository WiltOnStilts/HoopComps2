#!/usr/bin/env node
/** Build players-seed.json from careers + explicit team-year rosters. Run: node scripts/generate-rosters.mjs */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expandCareerToSeason, expandExplicitEntry, ratingsForCareer } from "../lib/roster-builder.mjs";
import { normalizePlayerPositions } from "../lib/position-normalize.mjs";
import { applyCareerPositionHints, loadCareerPositionHints } from "../lib/position-inference.mjs";
import { ratingRowQuality } from "../lib/rating-quality.mjs";
import { ratingsFromStatRow } from "../lib/ratings-from-stats.mjs";
import { seasonRosters } from "./roster-snapshots.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "data", "dynasty", "players-seed.json");
const CAREERS_OUT = path.join(__dirname, "..", "data", "dynasty", "player-careers.json");
const IMPORTED = path.join(__dirname, "..", "data", "dynasty", "imported-bbgm.json");

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function career(name, birthYear, debut, primary, positions, peak, stints, allStarYears = []) {
  return {
    id: slug(name),
    name,
    birthYear,
    debut,
    primaryPosition: primary,
    positions: positions || [primary],
    peakRatings: peak,
    peakAge: peak.peakAge || 27,
    stints,
    allStarYears,
    allStar: allStarYears.length > 0 || (peak.impact || 0) >= 90,
  };
}

function stint(teamId, from, to) {
  return { teamId, from, to };
}

function peak(scoring, shooting, defense, playmaking, rebounding, health, impact) {
  return { scoring, shooting, defense, playmaking, rebounding, health, impact };
}

// --- Career database (franchise stints; thunder includes Sonics era) ---
const careers = [
  career("Michael Jordan", 1963, 1984, "SG", ["SG", "SF"], peak(98, 88, 92, 85, 75, 95, 99), [stint("bulls", 1984, 1993), stint("bulls", 1995, 1998)], [1987, 1988, 1989, 1990, 1991, 1992, 1993, 1996, 1997, 1998]),
  career("Scottie Pippen", 1965, 1987, "SF", ["SF", "PF", "SG"], peak(88, 78, 94, 82, 80, 90, 92), [stint("bulls", 1987, 1998)], [1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997]),
  career("Dennis Rodman", 1961, 1986, "PF", ["PF", "C"], peak(55, 50, 90, 55, 99, 88, 85), [stint("pistons", 1986, 1993), stint("spurs", 1993, 1995), stint("bulls", 1995, 1998)], [1990, 1991, 1992, 1993, 1996]),
  career("Toni Kukoc", 1968, 1993, "SF", ["SF", "PF", "SG"], peak(82, 84, 72, 80, 68, 92, 80), [stint("bulls", 1993, 2000)]),
  career("Luc Longley", 1969, 1991, "C", ["C"], peak(68, 62, 75, 58, 78, 85, 70), [stint("timberwolves", 1991, 1994), stint("bulls", 1994, 1998), stint("suns", 1998, 2001)]),
  career("Steve Kerr", 1965, 1988, "PG", ["PG"], peak(72, 88, 68, 78, 42, 88, 74), [stint("suns", 1988, 1989), stint("cavaliers", 1989, 1992), stint("magic", 1992, 1993), stint("bulls", 1993, 1998), stint("spurs", 1999, 2001), stint("blazers", 2001, 2002), stint("spurs", 2002, 2003)]),
  career("Ron Harper", 1964, 1986, "SG", ["SG", "SF"], peak(78, 72, 82, 72, 65, 85, 78), [stint("cavaliers", 1986, 1989), stint("clippers", 1989, 1994), stint("bulls", 1995, 1999), stint("lakers", 1999, 2001)]),
  career("Bill Wennington", 1963, 1985, "C", ["C"], peak(62, 58, 68, 55, 72, 82, 65), [stint("mavericks", 1985, 1990), stint("kings", 1990, 1993), stint("bulls", 1993, 1999)]),
  career("Stephen Curry", 1988, 2009, "PG", ["PG", "SG"], peak(96, 99, 68, 88, 55, 88, 97), [stint("warriors", 2009, 2026)], [2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2025]),
  career("Klay Thompson", 1990, 2011, "SG", ["SG", "SF"], peak(88, 92, 78, 65, 58, 82, 86), [stint("warriors", 2011, 2024), stint("mavericks", 2024, 2026)], [2015, 2016, 2017, 2018, 2019, 2022]),
  career("Draymond Green", 1990, 2012, "PF", ["PF", "C", "SF"], peak(72, 68, 92, 85, 82, 86, 88), [stint("warriors", 2012, 2026)], [2016, 2017, 2018, 2020, 2022]),
  career("Andrew Wiggins", 1995, 2014, "SF", ["SF", "SG"], peak(82, 78, 82, 65, 68, 90, 80), [stint("timberwolves", 2014, 2022), stint("warriors", 2022, 2026)], [2022]),
  career("Kevon Looney", 1996, 2015, "C", ["C", "PF"], peak(62, 55, 78, 58, 82, 88, 72), [stint("warriors", 2015, 2026)]),
  career("LeBron James", 1984, 2003, "SF", ["SF", "PF", "PG"], peak(96, 82, 85, 94, 82, 92, 98), [stint("cavaliers", 2003, 2010), stint("heat", 2010, 2014), stint("cavaliers", 2014, 2018), stint("lakers", 2018, 2026)], [2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]),
  career("Kyrie Irving", 1992, 2011, "PG", ["PG", "SG"], peak(92, 88, 68, 85, 48, 85, 90), [stint("cavaliers", 2011, 2017), stint("celtics", 2017, 2019), stint("nets", 2019, 2023), stint("mavericks", 2023, 2026)], [2013, 2014, 2015, 2021, 2023]),
  career("Kevin Love", 1988, 2008, "PF", ["PF", "C"], peak(85, 84, 68, 72, 88, 82, 84), [stint("timberwolves", 2008, 2014), stint("cavaliers", 2014, 2023), stint("heat", 2023, 2024), stint("lakers", 2024, 2026)], [2011, 2012, 2014, 2017, 2018]),
  career("Luka Doncic", 1999, 2018, "PG", ["PG", "SG", "SF"], peak(95, 85, 68, 95, 78, 88, 96), [stint("mavericks", 2018, 2026)], [2019, 2020, 2021, 2022, 2023, 2024, 2025]),
  career("Kobe Bryant", 1978, 1996, "SG", ["SG", "SF"], peak(96, 86, 85, 78, 65, 90, 96), [stint("lakers", 1996, 2016)], [1998, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2016]),
  career("Pau Gasol", 1980, 2001, "PF", ["PF", "C"], peak(86, 78, 78, 78, 88, 88, 88), [stint("grizzlies", 2001, 2008), stint("lakers", 2008, 2014), stint("bulls", 2014, 2016), stint("spurs", 2016, 2019), stint("bucks", 2019, 2021)], [2006, 2009, 2010, 2011, 2015, 2016]),
  career("Shaquille O'Neal", 1972, 1992, "C", ["C"], peak(95, 58, 82, 62, 95, 88, 97), [stint("magic", 1992, 1996), stint("lakers", 1996, 2004), stint("heat", 2004, 2008), stint("suns", 2008, 2009), stint("cavaliers", 2009, 2010), stint("celtics", 2010, 2011)], [1995, 1996, 1997, 1998, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2009]),
  career("Magic Johnson", 1959, 1979, "PG", ["PG", "SF"], peak(90, 78, 78, 99, 82, 92, 98), [stint("lakers", 1979, 1991), stint("lakers", 1996, 1996)], [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989, 1990, 1991]),
  career("Kareem Abdul-Jabbar", 1947, 1969, "C", ["C"], peak(88, 82, 85, 72, 88, 80, 92), [stint("bucks", 1969, 1975), stint("lakers", 1975, 1989)], [1970, 1971, 1972, 1973, 1974, 1975, 1976, 1977, 1979, 1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987]),
  career("Larry Bird", 1956, 1979, "SF", ["SF", "PF"], peak(92, 92, 78, 88, 82, 85, 96), [stint("celtics", 1979, 1992)], [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1990, 1991]),
  career("Tim Duncan", 1976, 1997, "PF", ["PF", "C"], peak(88, 72, 95, 72, 92, 92, 96), [stint("spurs", 1997, 2016)], [1998, 2000, 2001, 2002, 2003, 2004, 2005, 2007, 2013, 2015]),
  career("Tony Parker", 1982, 2001, "PG", ["PG"], peak(78, 72, 68, 82, 42, 88, 78), [stint("spurs", 2001, 2018), stint("hornets", 2018, 2019)], [2006, 2007, 2012, 2013, 2014]),
  career("Manu Ginobili", 1977, 2002, "SG", ["SG", "SF"], peak(82, 78, 75, 78, 55, 85, 84), [stint("spurs", 2002, 2018)], [2005, 2011]),
  career("Dirk Nowitzki", 1978, 1998, "PF", ["PF", "C"], peak(92, 92, 72, 78, 82, 88, 94), [stint("mavericks", 1998, 2019)], [2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2015, 2016, 2019]),
  career("Jason Kidd", 1973, 1994, "PG", ["PG"], peak(72, 72, 82, 92, 78, 85, 88), [stint("mavericks", 1994, 1996), stint("suns", 1996, 2001), stint("nets", 2001, 2008), stint("mavericks", 2008, 2012), stint("knicks", 2012, 2013)], [1996, 1998, 2001, 2002, 2004, 2008, 2010, 2011, 2013]),
  career("Kevin Durant", 1988, 2007, "SF", ["SF", "PF", "SG"], peak(96, 90, 78, 78, 78, 88, 96), [stint("thunder", 2007, 2016), stint("warriors", 2016, 2019), stint("nets", 2019, 2023), stint("suns", 2023, 2026)], [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2025]),
  career("Russell Westbrook", 1988, 2008, "PG", ["PG", "SG"], peak(92, 72, 72, 92, 82, 88, 92), [stint("thunder", 2008, 2019), stint("rockets", 2019, 2020), stint("wizards", 2020, 2021), stint("lakers", 2021, 2023), stint("clippers", 2023, 2025), stint("nuggets", 2025, 2026)], [2011, 2012, 2013, 2015, 2016, 2017, 2018, 2019, 2023]),
  career("Shai Gilgeous-Alexander", 1998, 2018, "PG", ["PG", "SG"], peak(94, 85, 78, 85, 58, 90, 94), [stint("clippers", 2018, 2019), stint("thunder", 2019, 2026)], [2023, 2024, 2025]),
  career("Joel Embiid", 1994, 2016, "C", ["C", "PF"], peak(95, 82, 88, 72, 88, 78, 94), [stint("76ers", 2016, 2026)], [2018, 2019, 2021, 2022, 2023, 2024, 2025]),
  career("Nikola Jokic", 1995, 2015, "C", ["C", "PF"], peak(92, 85, 72, 98, 92, 90, 98), [stint("nuggets", 2015, 2026)], [2019, 2020, 2021, 2022, 2023, 2024, 2025]),
  career("Giannis Antetokounmpo", 1994, 2013, "PF", ["PF", "SF", "C"], peak(92, 72, 90, 78, 88, 92, 96), [stint("bucks", 2013, 2026)], [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]),
  career("Jayson Tatum", 1998, 2017, "SF", ["SF", "PF"], peak(92, 85, 82, 78, 78, 90, 92), [stint("celtics", 2017, 2026)], [2020, 2021, 2022, 2023, 2024, 2025]),
  career("Jaylen Brown", 1996, 2016, "SG", ["SG", "SF"], peak(88, 78, 82, 72, 68, 90, 88), [stint("celtics", 2016, 2026)], [2021, 2023, 2024, 2025]),
  career("Anthony Edwards", 2001, 2020, "SG", ["SG", "SF"], peak(90, 82, 78, 72, 62, 90, 88), [stint("timberwolves", 2020, 2026)], [2023, 2024, 2025]),
  career("Victor Wembanyama", 2004, 2023, "C", ["C", "PF"], peak(82, 72, 95, 72, 88, 85, 90), [stint("spurs", 2023, 2026)], [2024, 2025]),
  career("Tyler Herro", 2000, 2019, "SG", ["SG", "PG"], peak(85, 86, 65, 75, 48, 85, 82), [stint("heat", 2019, 2026)], [2023, 2025]),
  career("Jimmy Butler", 1989, 2011, "SF", ["SF", "SG"], peak(88, 78, 88, 78, 68, 85, 90), [stint("bulls", 2011, 2017), stint("timberwolves", 2017, 2018), stint("76ers", 2018, 2019), stint("heat", 2019, 2026)], [2015, 2020, 2022, 2023, 2024, 2025]),
  career("Bam Adebayo", 1997, 2017, "C", ["C", "PF"], peak(82, 68, 88, 72, 82, 88, 86), [stint("heat", 2017, 2026)], [2020, 2023, 2024, 2025]),
  career("James Harden", 1989, 2009, "SG", ["SG", "PG"], peak(96, 88, 62, 92, 68, 90, 94), [stint("thunder", 2009, 2012), stint("rockets", 2012, 2021), stint("nets", 2021, 2022), stint("76ers", 2022, 2023), stint("clippers", 2023, 2026)], [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2025]),
  career("Chris Paul", 1985, 2005, "PG", ["PG"], peak(82, 82, 85, 95, 55, 82, 90), [stint("hornets", 2005, 2011), stint("clippers", 2011, 2017), stint("rockets", 2017, 2019), stint("thunder", 2019, 2020), stint("suns", 2020, 2023), stint("warriors", 2023, 2024), stint("spurs", 2024, 2026)], [2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2021, 2022]),
  career("Kawhi Leonard", 1991, 2011, "SF", ["SF", "PF"], peak(88, 82, 96, 72, 78, 82, 94), [stint("spurs", 2011, 2018), stint("raptors", 2018, 2019), stint("clippers", 2019, 2026)], [2012, 2013, 2014, 2016, 2017, 2019, 2020, 2021]),
  career("Damian Lillard", 1990, 2012, "PG", ["PG"], peak(92, 90, 68, 88, 48, 88, 90), [stint("blazers", 2012, 2023), stint("bucks", 2023, 2026)], [2014, 2015, 2016, 2018, 2019, 2021, 2023, 2024, 2025]),
  career("Devin Booker", 1996, 2015, "SG", ["SG", "PG"], peak(92, 90, 68, 78, 52, 88, 88), [stint("suns", 2015, 2026)], [2020, 2022, 2024, 2025]),
  career("Allen Iverson", 1975, 1996, "PG", ["PG", "SG"], peak(96, 78, 72, 85, 48, 88, 94), [stint("76ers", 1996, 2006), stint("nuggets", 2006, 2008), stint("pistons", 2008, 2009), stint("grizzlies", 2009, 2009), stint("76ers", 2009, 2010)], [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010]),
  career("Karl Malone", 1963, 1985, "PF", ["PF"], peak(92, 78, 78, 72, 88, 92, 92), [stint("jazz", 1985, 2003), stint("lakers", 2003, 2004)], [1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002]),
  career("Charles Barkley", 1963, 1984, "PF", ["PF", "SF"], peak(92, 72, 78, 82, 92, 88, 94), [stint("76ers", 1984, 1992), stint("suns", 1992, 1996), stint("rockets", 1996, 2000)], [1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997]),
  career("John Stockton", 1962, 1984, "PG", ["PG"], peak(78, 82, 78, 98, 48, 92, 92), [stint("jazz", 1984, 2003)], [1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 2000]),
  career("Patrick Ewing", 1962, 1985, "C", ["C"], peak(88, 72, 88, 62, 88, 85, 90), [stint("knicks", 1985, 2000), stint("thunder", 2000, 2000), stint("magic", 2001, 2002)], [1986, 1988, 1989, 1990, 1991, 1992, 1993, 1997]),
  career("Isiah Thomas", 1961, 1981, "PG", ["PG"], peak(85, 78, 78, 92, 48, 88, 90), [stint("pistons", 1981, 1994)], [1982, 1984, 1985, 1986, 1987, 1988, 1990, 1991, 1993]),
  career("Tracy McGrady", 1979, 1997, "SG", ["SG", "SF"], peak(95, 82, 72, 78, 68, 85, 92), [stint("raptors", 1997, 2000), stint("magic", 2000, 2004), stint("rockets", 2004, 2010), stint("knicks", 2010, 2011), stint("hawks", 2011, 2012), stint("spurs", 2012, 2013)], [2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008]),
  career("Reggie Miller", 1965, 1987, "SG", ["SG"], peak(88, 94, 72, 72, 48, 88, 88), [stint("pacers", 1987, 2005)], [1990, 1991, 1995, 1996, 1998, 2000, 2001, 2002, 2003, 2004]),
  career("Dwyane Wade", 1982, 2003, "SG", ["SG", "PG"], peak(88, 78, 82, 82, 58, 85, 90), [stint("heat", 2003, 2016), stint("bulls", 2016, 2017), stint("cavaliers", 2017, 2018), stint("heat", 2018, 2019)], [2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2016]),
  career("Chris Bosh", 1984, 2003, "PF", ["PF", "C"], peak(85, 78, 75, 68, 82, 85, 86), [stint("raptors", 2003, 2010), stint("heat", 2010, 2016)], [2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2016]),
  career("Anthony Davis", 1993, 2012, "PF", ["PF", "C"], peak(88, 78, 92, 68, 88, 82, 92), [stint("hornets", 2012, 2019), stint("pelicans", 2019, 2019), stint("lakers", 2019, 2026)], [2014, 2015, 2016, 2017, 2018, 2020, 2024, 2025]),
  career("Carmelo Anthony", 1984, 2003, "SF", ["SF", "PF"], peak(92, 82, 62, 68, 72, 88, 88), [stint("nuggets", 2003, 2011), stint("knicks", 2011, 2017), stint("thunder", 2017, 2018), stint("rockets", 2018, 2019), stint("blazers", 2019, 2021), stint("lakers", 2021, 2022)], [2007, 2008, 2010, 2011, 2012, 2013, 2014, 2017, 2021, 2022]),
  career("Derrick Rose", 1988, 2008, "PG", ["PG"], peak(90, 72, 72, 85, 48, 78, 90), [stint("bulls", 2008, 2016), stint("knicks", 2016, 2018), stint("cavaliers", 2018, 2018), stint("timberwolves", 2018, 2019), stint("pistons", 2019, 2021), stint("knicks", 2021, 2022), stint("grizzlies", 2023, 2024)], [2010, 2011, 2012, 2019]),
  career("Donovan Mitchell", 1996, 2017, "SG", ["SG", "PG"], peak(90, 85, 72, 78, 52, 88, 88), [stint("jazz", 2017, 2022), stint("cavaliers", 2022, 2026)], [2020, 2021, 2022, 2023, 2024, 2025]),
  career("Darius Garland", 2000, 2019, "PG", ["PG"], peak(85, 86, 65, 88, 42, 85, 84), [stint("cavaliers", 2019, 2026)], [2022, 2024, 2025]),
  career("Trae Young", 1998, 2018, "PG", ["PG"], peak(90, 86, 58, 92, 42, 85, 88), [stint("hawks", 2018, 2026)], [2020, 2021, 2022, 2024, 2025]),
  career("Jalen Brunson", 1996, 2018, "PG", ["PG"], peak(88, 86, 72, 88, 42, 90, 88), [stint("mavericks", 2018, 2022), stint("knicks", 2022, 2026)], [2024, 2025]),
  career("Tyrese Haliburton", 2000, 2020, "PG", ["PG", "SG"], peak(85, 84, 68, 92, 48, 85, 88), [stint("kings", 2020, 2022), stint("pacers", 2022, 2026)], [2023, 2024, 2025]),
  career("De'Aaron Fox", 1997, 2017, "PG", ["PG"], peak(88, 78, 72, 82, 48, 88, 86), [stint("kings", 2017, 2026)], [2022, 2024, 2025]),
  career("Domantas Sabonis", 1996, 2016, "C", ["C", "PF"], peak(82, 72, 68, 82, 92, 88, 86), [stint("thunder", 2016, 2017), stint("pacers", 2017, 2022), stint("kings", 2022, 2026)], [2020, 2023, 2024, 2025]),
  career("Zion Williamson", 2000, 2019, "PF", ["PF", "C"], peak(90, 62, 65, 72, 78, 72, 86), [stint("pelicans", 2019, 2026)], [2021, 2024, 2025]),
  career("Kevin McHale", 1957, 1980, "PF", ["PF", "C"], peak(88, 78, 85, 68, 85, 88, 90), [stint("celtics", 1980, 1993)], [1984, 1986, 1987, 1988, 1989, 1990, 1991]),
  career("Robert Parish", 1953, 1976, "C", ["C"], peak(78, 72, 82, 58, 88, 90, 85), [stint("warriors", 1976, 1980), stint("celtics", 1980, 1994), stint("hornets", 1994, 1997)], [1981, 1982, 1985, 1986, 1987, 1990, 1991, 1992, 1993, 1997]),
  career("Dennis Johnson", 1954, 1976, "SG", ["SG", "PG"], peak(78, 72, 90, 78, 62, 88, 86), [stint("thunder", 1976, 1980), stint("suns", 1980, 1980), stint("celtics", 1980, 1990)], [1979, 1980, 1981, 1982, 1985, 1986, 1987]),
  career("David Robinson", 1965, 1989, "C", ["C"], peak(88, 75, 92, 72, 90, 88, 92), [stint("spurs", 1989, 2003)], [1990, 1991, 1992, 1993, 1994, 1995, 1996, 1998, 2000, 2001]),
  career("James Worthy", 1961, 1982, "SF", ["SF", "PF"], peak(88, 78, 78, 72, 72, 90, 88), [stint("lakers", 1982, 1994)], [1986, 1987, 1988, 1990, 1991, 1992, 1993]),
  career("Derek Fisher", 1974, 1996, "PG", ["PG"], peak(68, 72, 72, 75, 42, 88, 72), [stint("lakers", 1996, 2004), stint("warriors", 2004, 2004), stint("jazz", 2004, 2007), stint("lakers", 2007, 2012), stint("thunder", 2012, 2013), stint("mavericks", 2013, 2014)]),
  career("Lamar Odom", 1979, 1999, "PF", ["PF", "SF"], peak(78, 72, 75, 78, 82, 85, 80), [stint("clippers", 1999, 2004), stint("heat", 2004, 2004), stint("lakers", 2004, 2011), stint("mavericks", 2011, 2012), stint("clippers", 2012, 2013)]),
  career("Andrew Bynum", 1987, 2005, "C", ["C"], peak(78, 62, 82, 55, 85, 75, 80), [stint("lakers", 2005, 2012), stint("76ers", 2012, 2013), stint("cavaliers", 2013, 2014)], [2012]),
  career("Kyle Lowry", 1986, 2006, "PG", ["PG"], peak(78, 78, 82, 85, 62, 88, 84), [stint("grizzlies", 2006, 2009), stint("rockets", 2009, 2012), stint("raptors", 2012, 2021), stint("heat", 2021, 2023), stint("76ers", 2023, 2024)], [2015, 2016, 2017, 2019, 2020, 2021]),
  career("Pascal Siakam", 1994, 2016, "PF", ["PF", "SF"], peak(82, 72, 78, 72, 75, 90, 82), [stint("raptors", 2016, 2023), stint("pacers", 2023, 2026)], [2020, 2023]),
  career("Tyson Chandler", 1982, 2001, "C", ["C"], peak(65, 55, 88, 55, 85, 88, 82), [stint("bulls", 2001, 2006), stint("hornets", 2006, 2010), stint("mavericks", 2010, 2011), stint("knicks", 2011, 2014), stint("mavericks", 2014, 2015), stint("suns", 2015, 2016), stint("kings", 2016, 2017), stint("nets", 2017, 2018), stint("lakers", 2018, 2019), stint("rockets", 2019, 2020)], [2012]),
  career("Chris Webber", 1973, 1993, "PF", ["PF", "C"], peak(88, 78, 75, 82, 85, 82, 88), [stint("warriors", 1993, 1994), stint("wizards", 1994, 1998), stint("kings", 1998, 2005), stint("76ers", 2005, 2007), stint("pistons", 2007, 2008)], [1997, 2000, 2001, 2002, 2003, 2004]),
  career("Mike Bibby", 1978, 1998, "PG", ["PG"], peak(78, 82, 68, 82, 42, 88, 78), [stint("grizzlies", 1998, 2001), stint("kings", 2001, 2008), stint("hawks", 2008, 2011), stint("wizards", 2011, 2012), stint("knicks", 2012, 2012)], [2002]),
  career("Joe Dumars", 1963, 1985, "SG", ["SG"], peak(78, 82, 88, 78, 48, 90, 86), [stint("pistons", 1985, 1999)], [1989, 1990, 1991, 1992, 1993, 1994, 1995, 1997, 2000]),
  career("Bill Laimbeer", 1957, 1980, "C", ["C", "PF"], peak(72, 78, 82, 65, 82, 88, 80), [stint("cavaliers", 1980, 1982), stint("pistons", 1982, 1994)], [1983, 1984, 1985, 1987, 1988, 1989, 1990, 1991, 1993]),
  career("Jamal Murray", 1997, 2016, "PG", ["PG", "SG"], peak(88, 86, 72, 82, 48, 82, 86), [stint("nuggets", 2016, 2026)]),
  career("Gary Payton", 1968, 1990, "PG", ["PG"], peak(82, 78, 92, 82, 55, 90, 90), [stint("thunder", 1990, 2003), stint("bucks", 2003, 2003), stint("lakers", 2003, 2004), stint("celtics", 2004, 2005), stint("heat", 2005, 2007)], [1995, 1996, 1997, 1998, 2000, 2002, 2003]),
  career("Shawn Kemp", 1969, 1989, "PF", ["PF", "C"], peak(88, 68, 72, 65, 85, 85, 86), [stint("thunder", 1989, 1997), stint("cavaliers", 1997, 2000), stint("blazers", 2000, 2002), stint("magic", 2002, 2003)], [1993, 1994, 1995, 1996, 1998]),
  career("Kevin Garnett", 1976, 1995, "PF", ["PF", "C"], peak(88, 72, 92, 78, 92, 88, 94), [stint("timberwolves", 1995, 2007), stint("celtics", 2007, 2013), stint("nets", 2013, 2015), stint("timberwolves", 2015, 2016)], [1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2016]),
  career("Paul Pierce", 1977, 1998, "SF", ["SF", "SG"], peak(88, 82, 78, 78, 68, 88, 90), [stint("celtics", 1998, 2013), stint("nets", 2013, 2014), stint("wizards", 2014, 2015), stint("clippers", 2015, 2017)], [2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012]),
  career("Ray Allen", 1975, 1996, "SG", ["SG"], peak(88, 94, 72, 75, 52, 88, 88), [stint("bucks", 1996, 2003), stint("thunder", 2003, 2007), stint("celtics", 2007, 2012), stint("heat", 2012, 2014)], [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013]),
  career("Rajon Rondo", 1986, 2006, "PG", ["PG"], peak(78, 72, 82, 92, 55, 85, 84), [stint("celtics", 2006, 2014), stint("mavericks", 2014, 2015), stint("kings", 2015, 2016), stint("bulls", 2016, 2017), stint("pelicans", 2017, 2018), stint("lakers", 2018, 2020), stint("hawks", 2020, 2021), stint("clippers", 2021, 2022), stint("cavaliers", 2022, 2023)]),
  career("Paul George", 1990, 2010, "SF", ["SF", "SG"], peak(88, 85, 82, 78, 68, 82, 88), [stint("pacers", 2010, 2017), stint("thunder", 2017, 2019), stint("clippers", 2019, 2024), stint("76ers", 2024, 2026)], [2013, 2014, 2016, 2017, 2018, 2019, 2020, 2021, 2023, 2024, 2025]),
  career("Blake Griffin", 1989, 2010, "PF", ["PF", "C"], peak(88, 72, 68, 78, 82, 75, 86), [stint("clippers", 2010, 2018), stint("pistons", 2018, 2021), stint("nets", 2021, 2022), stint("celtics", 2022, 2023)], [2011, 2012, 2013, 2014, 2015, 2019]),
  career("LaMarcus Aldridge", 1985, 2006, "PF", ["PF", "C"], peak(85, 82, 72, 68, 82, 85, 84), [stint("blazers", 2006, 2015), stint("spurs", 2015, 2021), stint("nets", 2021, 2022)], [2012, 2013, 2014, 2015, 2016, 2018, 2019]),
  career("Al Horford", 1986, 2007, "C", ["C", "PF"], peak(78, 72, 82, 72, 82, 88, 82), [stint("hawks", 2007, 2016), stint("celtics", 2016, 2019), stint("76ers", 2019, 2020), stint("thunder", 2020, 2020), stint("celtics", 2020, 2026)], [2010, 2011, 2015, 2016, 2018, 2023, 2024, 2025]),
  career("Marc Gasol", 1985, 2008, "C", ["C"], peak(78, 72, 88, 78, 82, 85, 84), [stint("grizzlies", 2008, 2019), stint("raptors", 2019, 2020), stint("lakers", 2020, 2021)], [2012, 2015, 2017, 2021]),
  career("Ja Morant", 1999, 2019, "PG", ["PG"], peak(90, 78, 68, 88, 52, 82, 88), [stint("grizzlies", 2019, 2026)], [2020, 2022, 2024, 2025]),
  career("Jaren Jackson Jr.", 1999, 2018, "PF", ["PF", "C"], peak(82, 78, 92, 65, 78, 85, 84), [stint("grizzlies", 2018, 2026)], [2023, 2025]),
  career("Chet Holmgren", 2002, 2022, "C", ["C", "PF"], peak(78, 78, 88, 65, 82, 82, 82), [stint("thunder", 2022, 2026)]),
  career("Jalen Williams", 2001, 2022, "SF", ["SF", "SG"], peak(85, 78, 78, 72, 62, 88, 84), [stint("thunder", 2022, 2026)]),
  career("PJ Washington", 1998, 2019, "PF", ["PF", "C"], peak(78, 72, 75, 65, 72, 85, 76), [stint("hornets", 2019, 2023), stint("mavericks", 2023, 2026)]),
  career("Daniel Gafford", 1998, 2019, "C", ["C"], peak(72, 58, 78, 55, 82, 88, 74), [stint("bulls", 2019, 2021), stint("wizards", 2021, 2024), stint("mavericks", 2024, 2026)]),
  career("Dereck Lively II", 2004, 2023, "C", ["C"], peak(72, 58, 82, 58, 78, 85, 76), [stint("mavericks", 2023, 2026)]),
  career("Josh Green", 2000, 2020, "SG", ["SG", "SF"], peak(72, 78, 72, 65, 55, 85, 72), [stint("mavericks", 2020, 2024), stint("hornets", 2024, 2026)]),
  career("Derrick Jones Jr.", 1997, 2016, "SF", ["SF", "PF"], peak(75, 72, 78, 62, 65, 85, 74), [stint("suns", 2016, 2018), stint("heat", 2018, 2020), stint("blazers", 2020, 2022), stint("bulls", 2022, 2023), stint("mavericks", 2023, 2026)]),
  career("Tim Hardaway Jr.", 1992, 2013, "SG", ["SG", "SF"], peak(82, 82, 65, 68, 48, 82, 78), [stint("knicks", 2013, 2015), stint("hawks", 2015, 2016), stint("knicks", 2016, 2019), stint("mavericks", 2019, 2024), stint("pistons", 2024, 2025), stint("nuggets", 2025, 2026)], [2018]),
  career("Wilt Chamberlain", 1936, 1959, "C", ["C"], peak(99, 72, 82, 72, 99, 88, 99), [stint("warriors", 1959, 1965), stint("76ers", 1965, 1968), stint("lakers", 1968, 1973)], [1960, 1961, 1962, 1963, 1964, 1965, 1966, 1967, 1968, 1969, 1970, 1971, 1972, 1973]),
  career("Bill Russell", 1934, 1956, "C", ["C"], peak(72, 58, 99, 72, 95, 90, 98), [stint("celtics", 1956, 1969)], [1958, 1959, 1960, 1961, 1962, 1963, 1964, 1965, 1966, 1967, 1968, 1969]),
  career("Oscar Robertson", 1938, 1960, "PG", ["PG", "SG"], peak(88, 82, 78, 95, 72, 88, 96), [stint("kings", 1960, 1970), stint("bucks", 1970, 1974)], [1961, 1962, 1963, 1964, 1965, 1966, 1967, 1968, 1969, 1970, 1971, 1972, 1973, 1974]),
  career("Jerry West", 1938, 1960, "SG", ["SG", "PG"], peak(92, 88, 82, 85, 62, 88, 96), [stint("lakers", 1960, 1974)], [1961, 1962, 1963, 1964, 1965, 1966, 1967, 1968, 1969, 1970, 1971, 1972, 1973, 1974]),
  career("Julius Erving", 1950, 1971, "SF", ["SF", "PF"], peak(90, 78, 82, 78, 78, 88, 94), [stint("nets", 1971, 1976), stint("76ers", 1976, 1987)], [1972, 1973, 1974, 1975, 1976, 1977, 1978, 1979, 1980, 1981, 1982, 1983, 1984, 1985, 1986]),
  career("Moses Malone", 1955, 1974, "C", ["C", "PF"], peak(88, 72, 82, 65, 92, 88, 92), [stint("rockets", 1976, 1982), stint("76ers", 1982, 1986), stint("wizards", 1986, 1988), stint("hawks", 1988, 1991), stint("bucks", 1991, 1993), stint("76ers", 1993, 1994), stint("spurs", 1994, 1995)], [1978, 1979, 1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989, 1991, 1993, 1995]),
  career("Hakeem Olajuwon", 1963, 1984, "C", ["C"], peak(92, 68, 92, 72, 92, 88, 96), [stint("rockets", 1984, 2001), stint("raptors", 2001, 2002)], [1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001]),
  career("DeMar DeRozan", 1989, 2009, "SF", ["SF", "SG"], peak(88, 78, 68, 78, 55, 88, 86), [stint("raptors", 2009, 2018), stint("spurs", 2018, 2019), stint("bulls", 2019, 2026)], [2014, 2016, 2017, 2018, 2022, 2023, 2024, 2025]),
  career("Zach LaVine", 1995, 2014, "SG", ["SG", "SF"], peak(88, 86, 65, 72, 52, 85, 84), [stint("timberwolves", 2014, 2017), stint("bulls", 2017, 2026)], [2021, 2022, 2024, 2025]),
  career("Karl-Anthony Towns", 1995, 2015, "C", ["C", "PF"], peak(88, 82, 68, 72, 88, 85, 88), [stint("timberwolves", 2015, 2026)], [2018, 2019, 2022, 2024, 2025]),
  career("Paolo Banchero", 2002, 2022, "PF", ["PF", "SF"], peak(85, 78, 72, 78, 72, 88, 84), [stint("magic", 2022, 2026)], [2023, 2024, 2025]),
  career("Tyrese Maxey", 2000, 2020, "PG", ["PG", "SG"], peak(88, 82, 68, 82, 42, 88, 86), [stint("76ers", 2020, 2026)], [2024, 2025]),
  career("Bradley Beal", 1993, 2012, "SG", ["SG", "PG"], peak(88, 85, 65, 78, 48, 85, 86), [stint("wizards", 2012, 2023), stint("suns", 2023, 2026)], [2018, 2019, 2021, 2022, 2023, 2024, 2025]),
  career("Scottie Barnes", 2001, 2021, "SF", ["SF", "PF"], peak(82, 72, 78, 78, 72, 88, 84), [stint("raptors", 2021, 2026)], [2022, 2024, 2025]),
  career("Cade Cunningham", 2001, 2021, "PG", ["PG", "SG"], peak(85, 78, 68, 82, 55, 82, 84), [stint("pistons", 2021, 2026)], [2024, 2025]),
  career("Alperen Sengun", 2002, 2021, "C", ["C", "PF"], peak(82, 68, 72, 78, 82, 85, 82), [stint("rockets", 2021, 2026)], [2024, 2025]),
  career("Jalen Green", 2002, 2021, "SG", ["SG"], peak(85, 80, 62, 68, 48, 85, 80), [stint("rockets", 2021, 2026)], [2024, 2025]),
  career("Fred VanVleet", 1994, 2016, "PG", ["PG"], peak(78, 82, 72, 78, 48, 85, 78), [stint("raptors", 2016, 2020), stint("rockets", 2020, 2026)], [2022, 2024, 2025]),
  career("LaMelo Ball", 2001, 2020, "PG", ["PG", "SG"], peak(88, 82, 62, 85, 55, 78, 86), [stint("hornets", 2020, 2026)], [2021, 2022, 2024, 2025]),
  career("Miles Bridges", 1998, 2018, "SF", ["SF", "PF"], peak(82, 78, 72, 68, 68, 85, 80), [stint("hornets", 2018, 2026)], [2022, 2024, 2025]),
  career("Evan Mobley", 2001, 2021, "PF", ["PF", "C"], peak(82, 68, 88, 68, 82, 88, 84), [stint("cavaliers", 2021, 2026)], [2023, 2024, 2025]),
  career("Jarrett Allen", 1998, 2017, "C", ["C"], peak(78, 62, 82, 58, 82, 88, 80), [stint("nets", 2017, 2021), stint("cavaliers", 2021, 2026)], [2022, 2024, 2025]),
  career("Franz Wagner", 2001, 2021, "SF", ["SF", "PF"], peak(82, 78, 72, 72, 62, 88, 80), [stint("magic", 2021, 2026)], [2024, 2025]),
  career("Desmond Bane", 1998, 2020, "SG", ["SG"], peak(82, 82, 72, 72, 55, 85, 80), [stint("grizzlies", 2020, 2026)], [2022, 2024, 2025]),
  career("Julius Randle", 1994, 2014, "PF", ["PF", "C"], peak(85, 78, 68, 72, 82, 85, 84), [stint("lakers", 2014, 2016), stint("pelicans", 2016, 2019), stint("knicks", 2019, 2026)], [2021, 2022, 2023, 2024, 2025]),
  career("Khris Middleton", 1991, 2012, "SF", ["SF", "SG"], peak(82, 82, 72, 72, 55, 82, 82), [stint("pistons", 2012, 2013), stint("bucks", 2013, 2026)], [2015, 2019, 2020, 2022, 2024, 2025]),
  career("Brook Lopez", 1988, 2008, "C", ["C"], peak(78, 78, 82, 58, 72, 85, 78), [stint("nets", 2008, 2017), stint("lakers", 2017, 2018), stint("bucks", 2018, 2026)], [2013, 2023, 2024, 2025]),
  career("Rudy Gobert", 1992, 2013, "C", ["C"], peak(72, 55, 92, 58, 92, 88, 84), [stint("jazz", 2013, 2022), stint("timberwolves", 2022, 2026)], [2017, 2019, 2021, 2024, 2025]),
  career("Brandon Ingram", 1997, 2016, "SF", ["SF", "PF"], peak(85, 78, 72, 72, 62, 82, 84), [stint("lakers", 2016, 2019), stint("pelicans", 2019, 2026)], [2020, 2024, 2025]),
  career("CJ McCollum", 1991, 2013, "SG", ["SG", "PG"], peak(85, 82, 65, 72, 48, 85, 82), [stint("blazers", 2013, 2022), stint("pelicans", 2022, 2026)], [2018, 2022, 2024, 2025]),
  career("Lauri Markkanen", 1997, 2017, "PF", ["PF", "SF"], peak(85, 85, 68, 65, 72, 85, 82), [stint("bulls", 2017, 2021), stint("cavaliers", 2021, 2022), stint("jazz", 2022, 2026)], [2023, 2024, 2025]),
  career("Deandre Ayton", 1998, 2018, "C", ["C"], peak(82, 72, 72, 58, 85, 85, 80), [stint("suns", 2018, 2024), stint("blazers", 2024, 2026)], [2021, 2024, 2025]),
  career("Anfernee Simons", 1999, 2018, "SG", ["SG", "PG"], peak(85, 86, 62, 75, 42, 85, 80), [stint("blazers", 2018, 2026)], [2024, 2025]),
  career("Keegan Murray", 2000, 2022, "PF", ["PF", "SF"], peak(75, 78, 72, 62, 68, 85, 74), [stint("kings", 2022, 2026)], [2024, 2025]),
  career("Devin Vassell", 2000, 2020, "SG", ["SG", "SF"], peak(82, 82, 72, 68, 52, 85, 78), [stint("spurs", 2020, 2026)], [2024, 2025]),
  career("Kyle Kuzma", 1995, 2017, "PF", ["PF", "SF"], peak(82, 78, 65, 68, 68, 85, 78), [stint("lakers", 2017, 2021), stint("wizards", 2021, 2024), stint("bucks", 2024, 2026)], [2021, 2024, 2025]),
  career("Jordan Poole", 1999, 2019, "SG", ["SG", "PG"], peak(82, 82, 62, 72, 42, 85, 78), [stint("warriors", 2019, 2023), stint("wizards", 2023, 2026)], [2022, 2024, 2025]),
  career("Michael Porter Jr.", 1998, 2019, "SF", ["SF", "PF"], peak(82, 88, 68, 65, 72, 78, 80), [stint("nuggets", 2019, 2026)], [2024, 2025]),
  career("Aaron Gordon", 1995, 2014, "PF", ["PF", "SF"], peak(78, 72, 78, 68, 72, 85, 78), [stint("magic", 2014, 2021), stint("nuggets", 2021, 2026)], [2024, 2025]),
  career("Mikal Bridges", 1996, 2018, "SF", ["SF", "SG"], peak(78, 78, 82, 68, 55, 88, 80), [stint("suns", 2018, 2023), stint("nets", 2023, 2026)], [2022, 2024, 2025]),
  career("Cam Thomas", 2001, 2021, "SG", ["SG"], peak(85, 85, 58, 68, 42, 85, 78), [stint("nets", 2021, 2026)], [2024, 2025]),
  career("Nic Claxton", 1999, 2019, "C", ["C"], peak(72, 55, 85, 58, 78, 85, 76), [stint("nets", 2019, 2026)], [2024, 2025]),
];

// Franchise alias: historical IDs map to current team ids
const FRANCHISE_ALIASES = {
  supersonics: "thunder",
  bullets: "wizards",
  royals: "kings",
  sonics: "thunder",
};

function resolveTeamId(teamId) {
  return FRANCHISE_ALIASES[teamId] || teamId;
}

const TEAMS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "dynasty", "teams.json"), "utf8"));
const MIN_YEAR = 1970;
const MAX_YEAR = 2026;

function findCareerByName(name) {
  return careers.find((c) => c.name === name);
}

function stubCareer(name, teamId, year) {
  const id = slug(name);
  const existing = findCareerByName(name);
  if (existing) return existing;
  return {
    id,
    name,
    birthYear: year - 25,
    debut: year - 2,
    primaryPosition: "SF",
    positions: ["SF"],
    peakRatings: peak(68, 66, 66, 62, 60, 82, 68),
    peakAge: 27,
    stints: [{ teamId, from: year, to: year }],
    allStarYears: [],
    allStar: false,
  };
}

function hydrateImportedRow(row) {
  const careerHint = loadCareerPositionHints().get(row.name?.toLowerCase());
  let base = row;
  if (careerHint) base = applyCareerPositionHints(row, careerHint);
  const normalized = normalizePlayerPositions(base);
  if (normalized.stats && normalized.positions?.length) {
    normalized.ratings = ratingsFromStatRow(normalized.stats, normalized.positions);
  }
  return normalized;
}

function addPlayerToRoster(players, player) {
  const normalized = hydrateImportedRow(player);
  const key = `${normalized.name.toLowerCase()}:${normalized.teamId}:${normalized.year}`;
  const existing = players.get(key);
  if (!existing || ratingRowQuality(normalized) > ratingRowQuality(existing)) {
    players.set(key, normalized);
  }
}

function loadImportedPlayers() {
  const rows = [];
  if (fs.existsSync(IMPORTED)) {
    const data = JSON.parse(fs.readFileSync(IMPORTED, "utf8"));
    rows.push(...(data.players || data));
  }

  const seedNbaRows = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, "utf8")).filter((p) => p.source === "nba-api")
    : [];
  const nbaApi = path.join(__dirname, "..", "data", "dynasty", "raw", "nba-api-rosters.json");
  if (fs.existsSync(nbaApi)) {
    const data = JSON.parse(fs.readFileSync(nbaApi, "utf8"));
    const rawRows = data.players || data;
    const rawKeys = new Set(
      rawRows.map((p) => `${p.name.toLowerCase()}:${p.teamId}:${p.year}`)
    );
    for (const row of seedNbaRows) {
      const key = `${row.name.toLowerCase()}:${row.teamId}:${row.year}`;
      if (!rawKeys.has(key)) rows.push(row);
    }
    rows.push(...rawRows);
  } else {
    rows.push(...seedNbaRows);
  }

  return rows.map(hydrateImportedRow).sort((a, b) => ratingRowQuality(a) - ratingRowQuality(b));
}

function buildRosterIndex() {
  const byKey = new Map();
  const imported = loadImportedPlayers();

  for (let year = MIN_YEAR; year <= MAX_YEAR; year++) {
    for (const team of TEAMS) {
      const key = `${team.id}:${year}`;
      const players = new Map();

      for (const row of imported) {
        if (row.teamId === team.id && row.year === year) {
          addPlayerToRoster(players, row);
        }
      }

      for (const c of careers) {
        const p = expandCareerToSeason(c, team.id, year);
        if (p) {
          const hinted = applyCareerPositionHints(p, c);
          addPlayerToRoster(players, hinted);
        }
      }

      const snapshotNames = seasonRosters[key];
      if (snapshotNames) {
        for (const name of snapshotNames) {
          const c = stubCareer(name, team.id, year);
          const p = expandCareerToSeason(c, team.id, year);
          if (p) addPlayerToRoster(players, p);
        }
      }

      if (players.size > 0) {
        byKey.set(key, [...players.values()].sort((a, b) => b.ratings.impact - a.ratings.impact));
      }
    }
  }

  return byKey;
}

const index = buildRosterIndex();
const flat = [];
for (const roster of index.values()) flat.push(...roster);

// Deduplicate by id
const seen = new Set();
const unique = flat
  .map(normalizePlayerPositions)
  .filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  })
  .map(({ stats: _stats, ...player }) => player);

fs.writeFileSync(CAREERS_OUT, JSON.stringify(careers, null, 2));
fs.writeFileSync(OUT, JSON.stringify(unique, null, 2));

const counts = [...index.entries()].map(([k, v]) => v.length);
console.log(`Generated ${unique.length} player-season entries`);
console.log(`Team-years covered: ${index.size}`);
console.log(`Roster size — min: ${Math.min(...counts)}, max: ${Math.max(...counts)}, avg: ${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)}`);
