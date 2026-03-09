import { fetchWeeklyGames, fetchInjuries, fetchStandingsMover, fetchTop10, getLastWeekRange } from './fetchWeeklyData.js';
import { buildStorylines } from './storylineEngine.js';
import { buildCardHTML, buildInjuryCardPages } from './buildCard.js';
import { renderCard } from './renderCard.js';

async function main() {
  const args = process.argv.slice(2);
  let startDate, endDate;
  if (args.length >= 2) {
    startDate = args[0];
    endDate   = args[1];
  } else {
    ({ startDate, endDate } = getLastWeekRange());
  }

  console.log(`\n🏒 Generating weekly recap for ${startDate} → ${endDate}\n`);

  console.log('📡 Fetching data...');
  const [
    { games, playerStats },
    standingsMover,
    injuries,
    top10,
  ] = await Promise.all([
    fetchWeeklyGames(startDate, endDate),
    fetchStandingsMover(startDate, endDate),
    fetchInjuries(),
    fetchTop10(startDate),
  ]);

  const regularSeason = games.filter(g => g.gameType === 2);

  if (regularSeason.length === 0) {
    console.warn('⚠️  No regular season games found for this date range.');
    process.exit(0);
  }

  console.log(`   Games: ${regularSeason.length} | Player logs: ${playerStats.length}`);
  console.log(`   Injuries: ${injuries?.total ?? 'N/A'}`);
  console.log(`   Standings riser: ${standingsMover?.biggestRiser?.abbr ?? 'N/A'} (+${standingsMover?.biggestRiser?.pointsGained ?? 0} pts)`);
  console.log(`   Standings faller: ${standingsMover?.biggestFaller?.abbr ?? 'N/A'} (-${standingsMover?.biggestFaller?.pointsLost ?? 0} pts)`);

  console.log('📊 Analyzing storylines...');
  const story = buildStorylines(games, playerStats, top10);

  console.log('🎨 Building card HTML...');
  const html         = buildCardHTML({ games: regularSeason, story, injuries, standingsMover, top10, startDate, endDate });
  const injuryPages  = buildInjuryCardPages({ injuries, startDate, endDate });

  const filename = `${startDate}_weekly-recap.png`;
  console.log(`🖼  Rendering main card: ${filename}`);
  const outputPath = await renderCard(html, filename);

  for (const page of injuryPages) {
    console.log(`🖼  Rendering injury card: ${page.filename}`);
    await renderCard(page.html, page.filename, { fixedHeight: 1350 });
  }

  console.log(`\n✨ Done!`);
  console.log(`   Main card:   ${outputPath}`);
  console.log(`   Injury cards: ${injuryPages.length} page(s)\n`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
