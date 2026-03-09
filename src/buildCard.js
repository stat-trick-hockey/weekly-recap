import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function buildCardHTML({ games, story, injuries, standingsMover, top10, startDate, endDate }) {
  const templatePath = join(__dirname, '..', 'templates', 'card.html');
  let html = readFileSync(templatePath, 'utf-8');

  const byDate = groupByDate(games);
  const resultsSectionsHTML = buildResultsSections(byDate, top10 ?? new Set());
  const numbersHTML = buildNumbersHTML(story.numbers);

  // TOTW name split
  const totwWords = (story.teamOfWeek.name || '').split(' ');
  const mid = Math.ceil(totwWords.length / 2);
  const totwLine1 = totwWords.slice(0, mid).join(' ');
  const totwLine2 = totwWords.slice(mid).join(' ') || '';

  // Award cards
  const skaterHTML = buildAwardCard({
    icon: '⚡', label: 'Skater of the Week',
    name: story.skaterOfWeek?.name ?? '—',
    team: story.skaterOfWeek?.team ?? '',
    stat: story.skaterOfWeek?.statLine ?? 'N/A',
    sub:  story.skaterOfWeek ? `${story.skaterOfWeek.gamesPlayed} GP` : '',
    accentColor: 'var(--accent)',
  });

  const goalieHTML = buildAwardCard({
    icon: '🥅', label: 'Goalie of the Week',
    name: story.goalieOfWeek?.name ?? '—',
    team: story.goalieOfWeek?.team ?? '',
    stat: story.goalieOfWeek?.statLine ?? 'N/A',
    sub:  story.goalieOfWeek ? `${story.goalieOfWeek.saves} SV · ${story.goalieOfWeek.starts} GS` : '',
    accentColor: 'var(--gold)',
  });

  const goonHTML = buildAwardCard({
    icon: '🥊', label: 'Goon of the Week',
    name: story.goonOfWeek?.name ?? '—',
    team: story.goonOfWeek?.team ?? '',
    stat: story.goonOfWeek?.statLine ?? 'N/A',
    sub:  story.goonOfWeek ? `${story.goonOfWeek.gamesPlayed} GP` : '',
    accentColor: '#f87171',
  });

  // Info cards (injuries + standings)
  const riser  = standingsMover?.biggestRiser;
  const faller = standingsMover?.biggestFaller;
  const riserLabel  = riser  ? (riser.abbrs  ?? [riser.abbr]).join(' / ')  : '—';
  const fallerLabel = faller ? (faller.abbrs ?? [faller.abbr]).join(' / ') : '—';

  const injuryHTML = buildInfoCard({
    icon: '🩹', label: 'Injury Report (League)',
    primary: injuries ? String(injuries.total) : '—',
    primaryColor: '#f87171',
    desc: injuries ? 'Players currently injured' : 'Data unavailable',
    lines: injuries ? [
      `${injuries.out} Out`,
      `${injuries.ir} Injured Reserve`,
      `${injuries.dtd} Day-To-Day`,
    ] : [],
  });

  const standingsHTML = buildInfoCard({
    icon: '📈', label: 'Standings Movers',
    primary: riser ? `${riserLabel} ▲` : '—',
    primaryColor: 'var(--green)',
    desc: riser ? `+${riser.pointsGained} pts · biggest climber` : 'No data',
    lines: [
      riser  ? `▲ ${riserLabel}  +${riser.pointsGained} pts this week` : '',
      faller ? `▼ ${fallerLabel}  ${faller.pointsLost >= 0 ? '+' : ''}${faller.pointsLost} pts this week` : '',
    ].filter(Boolean),
  });

  // Game stats tile
  const totalGames = games.length;
  const otGames    = games.filter(g => g.isOT).length;
  const soGames    = games.filter(g => g.isSO).length;
  const blowouts   = games.filter(g => g.margin >= 5).length;
  const pct = (n) => totalGames > 0 ? Math.round((n / totalGames) * 100) + '%' : '—';

  const gameStatsHTML = buildInfoCard({
    icon: '📊', label: 'Game Breakdown',
    primary: null,
    primaryColor: 'var(--accent)',
    desc: null,
    lines: [],
    custom: `
      <div class="stat-row-mini"><span class="srl">OT</span><span class="srv" style="color:#93c5fd">${pct(otGames)}</span><span class="src">${otGames} games</span></div>
      <div class="stat-row-mini"><span class="srl">SO</span><span class="srv" style="color:#93c5fd">${pct(soGames)}</span><span class="src">${soGames} games</span></div>
      <div class="stat-row-mini"><span class="srl">Blowout</span><span class="srv" style="color:#f87171">${pct(blowouts)}</span><span class="src">${blowouts} games</span></div>
    `,
  });

  const replacements = {
    '{{WEEK_LABEL}}':            formatWeekLabel(startDate, endDate),
    '{{TOTAL_GAMES}}':           String(story.totalGames),
    '{{HEADLINE_TITLE}}':        escapeHTML(story.headline.title),
    '{{HEADLINE_BODY}}':         story.headline.body,
    '{{NUMBERS_HTML}}':          numbersHTML,
    '{{RESULTS_SECTIONS_HTML}}': resultsSectionsHTML,
    '{{TOTW_NAME_LINE1}}':       escapeHTML(totwLine1),
    '{{TOTW_NAME_LINE2}}':       escapeHTML(totwLine2),
    '{{TOTW_RECORD}}':           story.teamOfWeek.record,
    '{{TOTW_GD}}':               String(Math.abs(story.teamOfWeek.gd)),
    '{{TOTW_GF}}':               String(story.teamOfWeek.gf),
    '{{TOTW_GAMES}}':            String(story.teamOfWeek.wins + story.teamOfWeek.losses),
    '{{SKATER_PANEL}}':          skaterHTML,
    '{{GOALIE_PANEL}}':          goalieHTML,
    '{{GOON_PANEL}}':            goonHTML,
    '{{INJURY_PANEL}}':          injuryHTML,
    '{{TRADE_PANEL}}':           standingsHTML,
    '{{GAME_STATS_PANEL}}':      gameStatsHTML,
  };

  for (const [k, v] of Object.entries(replacements)) {
    html = html.replaceAll(k, v);
  }
  return html;
}

// ── Award card (3-up grid) ────────────────────────────────────────────────────

function buildAwardCard({ icon, label, name, team, stat, sub, accentColor }) {
  return `
    <div class="award-card">
      <div class="award-icon-label">
        <span class="award-icon">${icon}</span>
        <span class="award-label">${escapeHTML(label)}</span>
      </div>
      <div class="award-name">${escapeHTML(name)} <span class="award-team">${escapeHTML(team)}</span></div>
      <div class="award-stat" style="color:${accentColor}">${escapeHTML(stat)}</div>
      ${sub ? `<div class="award-sub">${escapeHTML(sub)}</div>` : ''}
    </div>`;
}

// ── Info card (2-up grid) ─────────────────────────────────────────────────────

function buildInfoCard({ icon, label, primary, primaryColor, desc, lines, custom }) {
  const lineHTML = (lines ?? [])
    .filter(Boolean).slice(0, 3)
    .map(l => `<div class="info-line">${escapeHTML(l)}</div>`).join('');
  const body = custom ?? `
    <div class="info-primary" style="color:${primaryColor || 'white'}">${escapeHTML(primary ?? '')}</div>
    <div class="info-desc">${escapeHTML(desc ?? '')}</div>
    <div class="info-lines">${lineHTML}</div>`;
  return `
    <div class="info-card">
      <div class="award-icon-label" style="margin-bottom:6px">
        <span class="award-icon">${icon}</span>
        <span class="award-label">${escapeHTML(label)}</span>
      </div>
      ${body}
    </div>`;
}

// ── Results sections (2-col grid) ────────────────────────────────────────────

function buildResultsSections(byDate, top10) {
  const totalGames = [...byDate.values()].reduce((s, g) => s + g.length, 0);
  // Responsive columns based on total game count
  const cols = totalGames <= 30 ? 2 : totalGames <= 45 ? 3 : 4;

  const sections = [];
  for (const [date, games] of byDate) {
    const label = formatDayLabel(date);
    const rows = games.map(g => {
      const badge = getBadge(g, top10);
      return `
        <div class="result-row">
          <span class="team-abbr ${g.away.won ? 'winner' : 'loser'}">${g.away.abbr}</span>
          <span class="vs-at">@</span>
          <span class="team-abbr ${g.home.won ? 'winner' : 'loser'}">${g.home.abbr}</span>
          <div class="score-display">
            <span class="${g.away.won ? 'score-w' : 'score-l'}">${g.away.score}</span>
            <span class="score-dash">–</span>
            <span class="${g.home.won ? 'score-w' : 'score-l'}">${g.home.score}</span>
          </div>
          ${badge ? `<span class="badge ${badge.cls}">${badge.text}</span>` : ''}
        </div>`;
    }).join('');

    sections.push(`
      <div class="day-block">
        <div class="day-label">${label}</div>
        ${rows}
      </div>`);
  }

  return `<div class="days-grid" style="grid-template-columns:repeat(${cols},1fr)">${sections.join('\n')}</div>`;
}

function getBadge(game, top10 = new Set()) {
  if (game.isSO)        return { cls: 'badge-so',      text: 'SO' };
  if (game.isOT)        return { cls: 'badge-ot',      text: 'OT' };
  if (game.margin >= 5) return { cls: 'badge-blowout', text: 'Blowout' };
  return null;
}

function buildNumbersHTML(numbers) {
  return numbers.map(n => `
    <div class="number-stat">
      <span class="number-value ${n.color || ''}">${escapeHTML(n.value)}</span>
      <span class="number-desc">${escapeHTML(n.desc)}</span>
    </div>`).join('');
}

// ── Formatting ────────────────────────────────────────────────────────────────

function groupByDate(games) {
  const map = new Map();
  for (const g of games) {
    if (!map.has(g.date)) map.set(g.date, []);
    map.get(g.date).push(g);
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function formatWeekLabel(start, end) {
  const s = new Date(start + 'T12:00:00Z');
  const e = new Date(end + 'T12:00:00Z');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (s.getUTCMonth() === e.getUTCMonth()) {
    return `${months[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}, ${e.getUTCFullYear()}`;
  }
  return `${months[s.getUTCMonth()]} ${s.getUTCDate()} – ${months[e.getUTCMonth()]} ${e.getUTCDate()}, ${e.getUTCFullYear()}`;
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function escapeHTML(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Injury Card (multi-page) ─────────────────────────────────────────────────

const STATUS_ORDER = (s) => {
  if (/^out$/i.test((s||'').trim())) return 0;
  if (/injured.reserve|\bIR\b/i.test(s)) return 1;
  if (/day.to.day|\bDTD\b/i.test(s)) return 2;
  return 3;
};

const STATUS_CLS = (s) => ['status-out','status-ir','status-dtd','status-other'][STATUS_ORDER(s)];



// NHL team primary colors for badge backgrounds
const TEAM_COLORS = {
  ANA:'#F47A38',ARI:'#8C2633',BOS:'#FFB81C',BUF:'#003087',
  CGY:'#C8102E',CAR:'#CC0000',CHI:'#CF0A2C',COL:'#6F263D',
  CBJ:'#002654',DAL:'#006847',DET:'#CE1126',EDM:'#FF4C00',
  FLA:'#C8102E',LAK:'#111111',MIN:'#154734',MTL:'#AF1E2D',
  NSH:'#FFB81C',NJD:'#CE1126',NYI:'#003087',NYR:'#0038A8',
  OTT:'#C2912C',PHI:'#F74902',PIT:'#FCB514',STL:'#002F87',
  SJS:'#006D75',SEA:'#001628',TBL:'#002868',TOR:'#003E7E',
  VAN:'#00205B',VGK:'#B4975A',WSH:'#C8102E',WPG:'#041E42',
  UTA:'#71B2C9',
};

function buildPlayerRow(p) {
  const color = TEAM_COLORS[p.team] || '#475569';
  const abbr  = (p.team || '???').toUpperCase();
  const badge = `<span class="team-badge" style="background:${color}">${escapeHTML(abbr)}</span>`;
  return `
    <div class="player-row">
      ${badge}
      <span class="player-name">${escapeHTML(p.name)}</span>
      <span class="player-status ${STATUS_CLS(p.status)}">${escapeHTML(p.status || 'Unknown')}</span>
      <span class="player-type">${escapeHTML(p.type)}</span>
    </div>`;
}

// Build one card page of HTML
function buildInjuryPage({ injuries, players, pageNum, totalPages, startDate, endDate }) {
  const templatePath = join(__dirname, '..', 'templates', 'injury-card.html');
  let html = readFileSync(templatePath, 'utf-8');

  const playersHTML = players.length
    ? players.map(buildPlayerRow).join('')
    : '<div style="color:rgba(255,255,255,0.3);font-family:DM Mono,monospace;font-size:13px;padding:20px 0">No injury data available</div>';

  const pageLabel = totalPages > 1 ? ` (${pageNum}/${totalPages})` : '';

  const replacements = {
    '{{WEEK_LABEL}}':     formatWeekLabel(startDate, endDate) + pageLabel,
    '{{TOTAL_INJURED}}':  String(injuries?.total ?? 0),
    '{{OUT_COUNT}}':      String(injuries?.out ?? 0),
    '{{IR_COUNT}}':       String(injuries?.ir ?? 0),
    '{{DTD_COUNT}}':      String(injuries?.dtd ?? 0),
    '{{PLAYERS_HTML}}':   playersHTML,
  };

  for (const [k, v] of Object.entries(replacements)) {
    html = html.replaceAll(k, v);
  }
  return html;
}

// Returns array of { html, filename } — one per page
export function buildInjuryCardPages({ injuries, startDate, endDate }) {
  const players = [...(injuries?.all ?? [])];
  players.sort((a, b) => STATUS_ORDER(a.status) - STATUS_ORDER(b.status));

  const PAGE_SIZE = 38; // ~38 players fit in 2-col grid at 1350px
  const pages = [];
  for (let i = 0; i < Math.max(1, players.length); i += PAGE_SIZE) {
    pages.push(players.slice(i, i + PAGE_SIZE));
  }

  return pages.map((chunk, idx) => ({
    html: buildInjuryPage({
      injuries,
      players: chunk,
      pageNum: idx + 1,
      totalPages: pages.length,
      startDate,
      endDate,
    }),
    filename: pages.length > 1
      ? `${startDate}_injury-report-${idx + 1}.png`
      : `${startDate}_injury-report.png`,
  }));
}
