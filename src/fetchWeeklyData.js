/**
 * fetchWeeklyData.js
 * Fetches all NHL games AND player boxscore stats for a given date range.
 */

const NHL_API = 'https://api-web.nhle.com/v1';

/**
 * Get all games + player stats for a date range.
 * @returns {Promise<{ games: Game[], playerStats: PlayerStat[] }>}
 */
export async function fetchWeeklyGames(startDate, endDate) {
  const dates = getDateRange(startDate, endDate);
  const allGames = [];
  const allPlayerStats = [];

  for (const date of dates) {
    const { games, playerStats } = await fetchGamesForDate(date);
    allGames.push(...games);
    allPlayerStats.push(...playerStats);
  }

  return { games: allGames, playerStats: allPlayerStats };
}

async function fetchGamesForDate(date) {
  const url = `${NHL_API}/score/${date}`;
  const games = [];
  const playerStats = [];

  try {
    const res = await fetch(url);
    if (!res.ok) return { games, playerStats };
    const data = await res.json();
    if (!data.games || data.games.length === 0) return { games, playerStats };

    const completed = data.games.filter(
      g => g.gameState === 'OFF' || g.gameState === 'FINAL'
    );

    for (const g of completed) {
      games.push(parseGame(g, date));
      // Fetch boxscore for player stats
      const stats = await fetchBoxscore(g.id);
      playerStats.push(...stats);
    }
  } catch (err) {
    console.warn(`Failed to fetch games for ${date}:`, err.message);
  }

  return { games, playerStats };
}

async function fetchBoxscore(gameId) {
  const url = `${NHL_API}/gamecenter/${gameId}/boxscore`;
  const players = [];

  try {
    const res = await fetch(url);
    if (!res.ok) return players;
    const data = await res.json();

    // Boxscore has playerByGameStats with forwards, defensemen, goalies per team
    const sides = ['homeTeam', 'awayTeam'];
    for (const side of sides) {
      const teamData = data.playerByGameStats?.[side];
      const teamAbbr = data[side]?.abbrev ?? '';
      if (!teamData) continue;

      // Skaters (forwards + defensemen)
      const skaterGroups = ['forwards', 'defense'];
      for (const group of skaterGroups) {
        for (const p of teamData[group] ?? []) {
          players.push({
            id: p.playerId,
            name: p.name?.default ?? 'Unknown',
            team: teamAbbr,
            position: group === 'forwards' ? 'F' : 'D',
            goals: p.goals ?? 0,
            assists: p.assists ?? 0,
            points: (p.goals ?? 0) + (p.assists ?? 0),
            pim: p.pim ?? 0,
            plusMinus: p.plusMinus ?? 0,
            isGoalie: false,
          });
        }
      }

      // Goalies
      for (const p of teamData.goalies ?? []) {
        const toi = p.toi ?? '0:00';
        const mins = toiToMinutes(toi);
        players.push({
          id: p.playerId,
          name: p.name?.default ?? 'Unknown',
          team: teamAbbr,
          position: 'G',
          goalsAgainst: p.goalsAgainst ?? 0,
          savePct: p.savePctg ?? 0,
          saves: p.saves ?? 0,
          shotsAgainst: (p.saves ?? 0) + (p.goalsAgainst ?? 0),
          toi: mins,
          decision: p.decision ?? null, // 'W', 'L', 'O'
          isGoalie: true,
        });
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch boxscore for game ${gameId}:`, err.message);
  }

  return players;
}

function toiToMinutes(toi) {
  const [m, s] = toi.split(':').map(Number);
  return (m || 0) + (s || 0) / 60;
}

function parseGame(g, date) {
  const homeScore = g.homeTeam?.score ?? 0;
  const awayScore = g.awayTeam?.score ?? 0;
  const homeWon = homeScore > awayScore;

  return {
    id: g.id,
    date,
    gameType: g.gameType,
    home: {
      abbr: g.homeTeam?.abbrev,
      name: g.homeTeam?.name?.default ?? g.homeTeam?.abbrev,
      score: homeScore,
      won: homeWon,
    },
    away: {
      abbr: g.awayTeam?.abbrev,
      name: g.awayTeam?.name?.default ?? g.awayTeam?.abbrev,
      score: awayScore,
      won: !homeWon,
    },
    margin: Math.abs(homeScore - awayScore),
    totalGoals: homeScore + awayScore,
    isSO: g.periodDescriptor?.periodType === 'SO',
    isOT: (g.periodDescriptor?.periodType === 'OT' || g.periodDescriptor?.number > 3) && g.periodDescriptor?.periodType !== 'SO',
    winner: homeWon
      ? { abbr: g.homeTeam?.abbrev, score: homeScore }
      : { abbr: g.awayTeam?.abbrev, score: awayScore },
    loser: homeWon
      ? { abbr: g.awayTeam?.abbrev, score: awayScore }
      : { abbr: g.homeTeam?.abbrev, score: homeScore },
  };
}

export function getLastWeekRange() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - daysToLastMonday - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  return {
    startDate: formatDate(lastMonday),
    endDate: formatDate(lastSunday),
  };
}

function getDateRange(start, end) {
  const dates = [];
  const cur = new Date(start + 'T12:00:00Z');
  const endD = new Date(end + 'T12:00:00Z');
  while (cur <= endD) {
    dates.push(formatDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

// ── Injuries (ESPN free API) ─────────────────────────────────────────────────

export async function fetchInjuries() {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries');
    if (!res.ok) {
      console.warn(`ESPN injuries API returned ${res.status}`);
      return null;
    }
    const data = await res.json();

    // ESPN structure: { injuries: [{ team: {abbreviation}, injuries: [{ athlete, status, details }] }] }
    // Sometimes top-level key is different - check both
    const teams = data.injuries ?? data.data ?? [];
    console.log(`ESPN injury teams found: ${teams.length}, keys: ${Object.keys(data).join(',')}`);
    const players = [];

    // ESPN uses full team display names — map to NHL abbreviations
    const ESPN_NAME_TO_NHL = {
      'Anaheim Ducks':'ANA','Boston Bruins':'BOS','Buffalo Sabres':'BUF',
      'Calgary Flames':'CGY','Carolina Hurricanes':'CAR','Chicago Blackhawks':'CHI',
      'Colorado Avalanche':'COL','Columbus Blue Jackets':'CBJ','Dallas Stars':'DAL',
      'Detroit Red Wings':'DET','Edmonton Oilers':'EDM','Florida Panthers':'FLA',
      'Los Angeles Kings':'LAK','Minnesota Wild':'MIN','Montréal Canadiens':'MTL',
      'Montreal Canadiens':'MTL','Nashville Predators':'NSH','New Jersey Devils':'NJD',
      'New York Islanders':'NYI','New York Rangers':'NYR','Ottawa Senators':'OTT',
      'Philadelphia Flyers':'PHI','Pittsburgh Penguins':'PIT','Seattle Kraken':'SEA',
      'San Jose Sharks':'SJS','St. Louis Blues':'STL','Tampa Bay Lightning':'TBL',
      'Toronto Maple Leafs':'TOR','Utah Hockey Club':'UTA','Vancouver Canucks':'VAN',
      'Vegas Golden Knights':'VGK','Washington Capitals':'WSH','Winnipeg Jets':'WPG',
    };

    for (const teamEntry of teams) {
      // ESPN gives displayName only — map full team name to NHL abbrev
      const teamAbbr = ESPN_NAME_TO_NHL[teamEntry.displayName] ?? teamEntry.displayName ?? '';

      for (const inj of teamEntry.injuries ?? []) {
        const status = inj.status ?? '';
        const injType = inj.details?.type ?? inj.details?.detail ?? 'Undisclosed';
        players.push({
          name: inj.athlete?.shortName ?? inj.athlete?.displayName ?? 'Unknown',
          team: teamAbbr,
          status,
          type: injType,
        });
      }
    }

    // Log all unique statuses so we can see what ESPN returns
    const uniqueStatuses = [...new Set(players.map(p => p.status))];
    console.log(`ESPN injury statuses seen: ${uniqueStatuses.join(' | ')}`);
    console.log(`ESPN total players: ${players.length}`);
    if (players.length > 0) {
      console.log(`ESPN sample player: ${JSON.stringify(players[0])}`);
      console.log(`ESPN sample player 2: ${JSON.stringify(players[1])}`);
      console.log(`ESPN sample player 3: ${JSON.stringify(players[2])}`);
    }

    // Count by status — match loosely since ESPN status strings vary by season
    const out = players.filter(p => /out/i.test(p.status)).length;
    const ir  = players.filter(p => /injured.reserve|\bIR\b/i.test(p.status)).length;
    const dtd = players.filter(p => /day.to.day|\bDTD\b/i.test(p.status)).length;

    // Pick 3 notable spread across different teams — no status filter, just pick first 3
    const seen = new Set();
    const notable = players
      .filter(p => { if (seen.has(p.team)) return false; seen.add(p.team); return true; })
      .slice(0, 3);

    return { total: players.length, out, ir, dtd, notable, all: players };
  } catch (err) {
    console.warn('Failed to fetch ESPN injuries:', err.message);
    return null;
  }
}


// ── Top-10 teams at week start (for upset detection) ─────────────────────────

export async function fetchTop10(startDate) {
  try {
    const res = await fetch(`${NHL_API}/standings/${startDate}`);
    if (!res.ok) return new Set();
    const data = await res.json();
    // NHL standings are already sorted by points desc
    const top10 = (data.standings ?? [])
      .slice(0, 10)
      .map(t => t.teamAbbrev?.default)
      .filter(Boolean);
    console.log(`   Top-10 at week start: ${top10.join(', ')}`);
    return new Set(top10);
  } catch (err) {
    console.warn('Failed to fetch top-10:', err.message);
    return new Set();
  }
}

// ── Standings Mover (NHL API) ─────────────────────────────────────────────────
// Compare standings at startDate vs endDate to find biggest climber/faller

export async function fetchStandingsMover(startDate, endDate) {
  try {
    const [resStart, resEnd] = await Promise.all([
      fetch(`${NHL_API}/standings/${startDate}`),
      fetch(`${NHL_API}/standings/${endDate}`),
    ]);
    if (!resStart.ok || !resEnd.ok) return null;

    const [dataStart, dataEnd] = await Promise.all([
      resStart.json(),
      resEnd.json(),
    ]);

    // Build points map for each date
    const toMap = (data) => {
      const map = {};
      for (const t of data.standings ?? []) {
        map[t.teamAbbrev?.default] = {
          abbr: t.teamAbbrev?.default,
          name: t.teamName?.default ?? t.teamAbbrev?.default,
          points: t.points ?? 0,
          wins: t.wins ?? 0,
        };
      }
      return map;
    };

    const start = toMap(dataStart);
    const end   = toMap(dataEnd);

    // Build array of all teams with point diff
    const diffs = [];
    for (const abbr of Object.keys(end)) {
      if (!start[abbr]) continue;
      const diff = end[abbr].points - start[abbr].points;
      diffs.push({ ...end[abbr], diff });
    }

    // Sort by diff - top is riser, bottom is faller
    diffs.sort((a, b) => b.diff - a.diff);

    console.log(`Standings diffs (top 5): ${diffs.slice(0,5).map(d => `${d.abbr}:${d.diff}`).join(', ')}`);
    console.log(`Standings diffs (bot 5): ${diffs.slice(-5).map(d => `${d.abbr}:${d.diff}`).join(', ')}`);

    const topDiff    = diffs[0]?.diff;
    const bottomDiff = diffs[diffs.length - 1]?.diff;

    // Collect all teams tied at the top/bottom
    const riserGroup  = diffs.filter(d => d.diff === topDiff);
    const fallerGroup = diffs.filter(d => d.diff === bottomDiff);

    const biggestRiser  = riserGroup.length  ? { abbrs: riserGroup.map(d => d.abbr),  pointsGained: topDiff,    abbr: riserGroup[0].abbr }  : null;
    const biggestFaller = fallerGroup.length ? { abbrs: fallerGroup.map(d => d.abbr), pointsLost:   bottomDiff, abbr: fallerGroup[0].abbr } : null;

    return { biggestRiser, biggestFaller };
  } catch (err) {
    console.warn('Failed to fetch standings:', err.message);
    return null;
  }
}
