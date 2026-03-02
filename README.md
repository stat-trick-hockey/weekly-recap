# 🏒 NHL Weekly Recap Card Generator

Automatically generates a broadcast-style **"This Week in Hockey"** Instagram card every Monday morning using real NHL API data.

## How It Works

1. **GitHub Actions** triggers every Monday at 8 AM ET
2. Fetches the previous week's NHL games from the [NHL Stats API](https://api-web.nhle.com)
3. Runs a **storyline engine** to find the week's best narratives (team of week, blowouts, upsets, notable scores)
4. Renders a **1080×1080 PNG** card using Puppeteer
5. Commits the PNG to `output/` — ready to post manually to Instagram

## Local Usage

```bash
npm install
npx puppeteer browsers install chrome

# Generate last week's recap
npm run generate

# Generate for a specific date range
node src/index.js 2026-02-24 2026-03-01
```

Output PNGs are saved to `output/YYYY-MM-DD_weekly-recap.png`.

## Project Structure

```
├── .github/workflows/weekly-recap.yml   # Monday automation
├── src/
│   ├── index.js              # Entry point
│   ├── fetchWeeklyData.js    # NHL API fetching
│   ├── storylineEngine.js    # Narrative analysis
│   ├── buildCard.js          # Template injection
│   └── renderCard.js         # Puppeteer → PNG
├── templates/
│   └── card.html             # Visual card template
└── output/                   # Generated PNGs committed here
```

## Storyline Engine

The engine automatically identifies:
- **Team of the Week** — best win/loss record + goal differential
- **Blowout of the Week** — largest margin of victory
- **Upset of the Week** — most surprising road win
- **Notable Numbers** — highest scoring game, biggest single-team output, etc.

## Manual Trigger

You can trigger a run manually from the **Actions** tab in GitHub, with optional `start_date` / `end_date` inputs to backfill any week.

## Customization

- **Branding**: Edit `templates/card.html` to change colors, fonts, or layout
- **Storyline logic**: Modify `src/storylineEngine.js` to tune what counts as a "blowout" or "upset"
- **Schedule**: Change the cron in `.github/workflows/weekly-recap.yml`
