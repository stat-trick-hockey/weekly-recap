/**
 * storylineEngine.js
 * Analyzes a week of games and player stats to extract narratives including:
 *   - Team of the Week
 *   - Skater of the Week (most points)
 *   - Goalie of the Week (best save%, min 2 decisions)
 *   - Goon of the Week (most PIM)
 *   - Blowout, Upset, Notable Numbers, Headline
 */

export function buildStorylines(games, playerStats = [], top10 = new Set()) {
  const regularSeason = games.filter(g => g.gameType === 2);
  const teamStats = buildTeamStats(regularSeason);

  // Aggregate player stats across all games
  const skaterMap = aggregateSkaters(playerStats.filter(p => !p.isGoalie));
  const goalieMap = aggregateGoalies(playerStats.filter(p => p.isGoalie));

  return {
    teamOfWeek:   getTeamOfWeek(teamStats),
    skaterOfWeek: getSkaterOfWeek(skaterMap),
    goalieOfWeek: getGoalieOfWeek(goalieMap),
    goonOfWeek:   getGoonOfWeek(skaterMap),
    blowout:      getBlowout(regularSeason),
    upset:        getUpset(regularSeason, top10),
    numbers:      getNotableNumbers(regularSeason, teamStats),
    headline:     buildHeadline(regularSeason, teamStats),
    totalGames:   regularSeason.length,
    totalGoals:   regularSeason.reduce((s, g) => s + g.totalGoals, 0),
  };
}

// ── Team Stats ────────────────────────────────────────────────────────────────

function buildTeamStats(games) {
  const stats = {};
  const ensure = (abbr, name) => {
    if (!stats[abbr]) stats[abbr] = { abbr, name, wins: 0, losses: 0, gf: 0, ga: 0, games: [] };
  };
  for (const g of games) {
    ensure(g.home.abbr, g.home.name);
    ensure(g.away.abbr, g.away.name);
    stats[g.home.abbr].gf += g.home.score;
    stats[g.home.abbr].ga += g.away.score;
    stats[g.home.abbr].games.push(g);
    if (g.home.won) stats[g.home.abbr].wins++; else stats[g.home.abbr].losses++;
    stats[g.away.abbr].gf += g.away.score;
    stats[g.away.abbr].ga += g.home.score;
    stats[g.away.abbr].games.push(g);
    if (g.away.won) stats[g.away.abbr].wins++; else stats[g.away.abbr].losses++;
  }
  for (const t of Object.values(stats)) {
    t.gd = t.gf - t.ga;
    t.gamesPlayed = t.wins + t.losses;
  }
  return stats;
}

// ── Player Aggregation ────────────────────────────────────────────────────────

function aggregateSkaters(skaters) {
  const map = {};
  for (const p of skaters) {
    if (!map[p.id]) {
      map[p.id] = { ...p, goals: 0, assists: 0, points: 0, pim: 0, gamesPlayed: 0 };
    }
    map[p.id].goals   += p.goals;
    map[p.id].assists += p.assists;
    map[p.id].points  += p.points;
    map[p.id].pim     += p.pim;
    map[p.id].gamesPlayed++;
  }
  return map;
}

function aggregateGoalies(goalies) {
  const map = {};
  for (const p of goalies) {
    // Only count starts (>= 20 min TOI)
    if (p.toi < 20) continue;
    if (!map[p.id]) {
      map[p.id] = { ...p, saves: 0, shotsAgainst: 0, goalsAgainst: 0, toi: 0, wins: 0, starts: 0 };
    }
    map[p.id].saves        += p.saves;
    map[p.id].shotsAgainst += p.shotsAgainst;
    map[p.id].goalsAgainst += p.goalsAgainst;
    map[p.id].toi          += p.toi;
    map[p.id].starts++;
    if (p.decision === 'W') map[p.id].wins++;
  }
  // Compute overall save%
  for (const g of Object.values(map)) {
    g.savePct = g.shotsAgainst > 0
      ? (g.saves / g.shotsAgainst)
      : 0;
  }
  return map;
}

// ── Awards ────────────────────────────────────────────────────────────────────

function getTeamOfWeek(teamStats) {
  const candidates = Object.values(teamStats).filter(t => t.gamesPlayed >= 2);
  const pool = candidates.length ? candidates : Object.values(teamStats);
  pool.sort((a, b) => (3 * b.wins + b.gd) - (3 * a.wins + a.gd));
  const w = pool[0];
  return {
    abbr: w.abbr, name: w.name, wins: w.wins, losses: w.losses,
    gf: w.gf, ga: w.ga, gd: w.gd,
    record: `${w.wins}–${w.losses}`,
  };
}

function getSkaterOfWeek(skaterMap) {
  const skaters = Object.values(skaterMap);
  if (!skaters.length) return null;
  skaters.sort((a, b) => b.points - a.points || b.goals - a.goals);
  const p = skaters[0];
  return {
    name: p.name,
    team: p.team,
    goals: p.goals,
    assists: p.assists,
    points: p.points,
    gamesPlayed: p.gamesPlayed,
    statLine: `${p.goals}G ${p.assists}A ${p.points}PTS`,
  };
}

function getGoalieOfWeek(goalieMap) {
  // Require at least 1 start, rank by save% then wins
  const goalies = Object.values(goalieMap).filter(g => g.starts >= 1);
  if (!goalies.length) return null;
  goalies.sort((a, b) => b.savePct - a.savePct || b.wins - a.wins);
  const g = goalies[0];
  return {
    name: g.name,
    team: g.team,
    savePct: g.savePct.toFixed(3).replace('0.', '.'),
    saves: g.saves,
    goalsAgainst: g.goalsAgainst,
    wins: g.wins,
    starts: g.starts,
    statLine: `${g.savePct.toFixed(3).replace('0.', '.')} SV% · ${g.wins}W`,
  };
}

function getGoonOfWeek(skaterMap) {
  const skaters = Object.values(skaterMap);
  if (!skaters.length) return null;
  skaters.sort((a, b) => b.pim - a.pim);
  const p = skaters[0];
  if (p.pim === 0) return null;
  return {
    name: p.name,
    team: p.team,
    pim: p.pim,
    gamesPlayed: p.gamesPlayed,
    statLine: `${p.pim} PIM`,
  };
}

// ── Blowout / Upset ───────────────────────────────────────────────────────────

function getBlowout(games) {
  if (!games.length) return null;
  const g = [...games].sort((a, b) => b.margin - a.margin)[0];
  return {
    winner: g.winner.abbr, loser: g.loser.abbr,
    winnerScore: g.winner.score, loserScore: g.loser.score,
    margin: g.margin, date: g.date,
    label: `${g.winner.abbr} ${g.winner.score}–${g.loser.score} ${g.loser.abbr}`,
  };
}

function getUpset(games, top10 = new Set()) {
  // Upset: away team wins AND home team was top-10 at week start
  const roadWins = games.filter(g => g.away.won && top10.has(g.home.abbr));
  if (!roadWins.length) return null;
  roadWins.sort((a, b) => b.margin - a.margin);
  const g = roadWins[0];
  return {
    winner: g.away.abbr, loser: g.home.abbr,
    winnerScore: g.away.score, loserScore: g.home.score,
    margin: g.margin, date: g.date,
    label: `${g.away.abbr} wins on the road, ${g.away.score}–${g.home.score}`,
  };
}

// ── Notable Numbers ───────────────────────────────────────────────────────────

function getNotableNumbers(games, teamStats) {
  const numbers = [];

  const highGame = [...games].sort((a, b) => b.totalGoals - a.totalGoals)[0];
  if (highGame) numbers.push({ value: String(highGame.totalGoals), desc: `Goals in\n${highGame.home.abbr} vs ${highGame.away.abbr}` });

  const bigTeamGame = [...games].sort((a, b) => Math.max(b.home.score, b.away.score) - Math.max(a.home.score, a.away.score))[0];
  if (bigTeamGame) {
    const big = bigTeamGame.home.score > bigTeamGame.away.score ? bigTeamGame.home : bigTeamGame.away;
    numbers.push({ value: String(big.score), desc: `${big.abbr} goals\nin one game`, color: 'accent' });
  }

  const topScoring = Object.values(teamStats).filter(t => t.gamesPlayed >= 2).sort((a, b) => b.gf - a.gf)[0];
  if (topScoring) numbers.push({ value: String(topScoring.gf), desc: `${topScoring.abbr} goals\nthis week`, color: 'gold' });

  const blowout = [...games].sort((a, b) => b.margin - a.margin)[0];
  if (blowout) numbers.push({ value: `${blowout.winner.score}–${blowout.loser.score}`, desc: `${blowout.winner.abbr} biggest\nblowout`, color: 'red' });

  return numbers.slice(0, 4);
}

// ── Headline ──────────────────────────────────────────────────────────────────

function buildHeadline(games, teamStats) {
  const totw = getTeamOfWeek(teamStats);
  const blowout = getBlowout(games);
  const teamBlowout = blowout && blowout.winner === totw.abbr;

  if (teamBlowout) {
    return {
      title: `${totw.name} Dominate the Week`,
      body: `The <strong>${totw.name}</strong> went ${totw.record} this week with a +${totw.gd} goal differential, including a dominant <strong>${blowout.label}</strong>.`,
    };
  }
  if (totw.wins >= 2) {
    return {
      title: `${totw.name} on a Roll`,
      body: `The <strong>${totw.name}</strong> went ${totw.record} this week, scoring ${totw.gf} goals with a +${totw.gd} goal differential. They were the clear team of the week.`,
    };
  }
  if (blowout) {
    return {
      title: `${blowout.winner} Rolls in Blowout of the Week`,
      body: `The biggest result of the week: <strong>${blowout.winner}</strong> dismantled <strong>${blowout.loser}</strong> ${blowout.winnerScore}–${blowout.loserScore} — a ${blowout.margin}-goal margin.`,
    };
  }
  return {
    title: 'A Wild Week Across the NHL',
    body: `${games.length} games played with plenty of drama throughout the week.`,
  };
}
