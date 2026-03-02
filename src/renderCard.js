/**
 * renderCard.js
 * Uses Puppeteer to render the card HTML to a 1080×1080 PNG.
 */

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'output');

/**
 * @param {string} html         - Full HTML string to render
 * @param {string} filename     - e.g. "2026-02-27_weekly-recap.png"
 * @param {object} options      - { fixedHeight: number } to override dynamic sizing
 * @returns {Promise<string>}   - Path to the saved PNG
 */
export async function renderCard(html, filename, options = {}) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = join(OUTPUT_DIR, filename);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
    ],
  });

  try {
    const page = await browser.newPage();

    if (options.fixedHeight) {
      // Fixed size — used for injury card pages
      const h = options.fixedHeight;
      await page.setViewport({ width: 1080, height: h, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2500)); // extra wait for external logos
      const screenshot = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1080, height: h },
        omitBackground: false,
      });
      writeFileSync(outputPath, screenshot);
    } else {
      // Dynamic height — measure content, snap to nearest 50px, min 1350, max 1350 (IG limit)
      await page.setViewport({ width: 1080, height: 2400, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500));

      const contentHeight = await page.evaluate(() => document.querySelector('.card').scrollHeight);
      const snapped = Math.min(1350, Math.max(1350, Math.ceil(contentHeight / 50) * 50));
      console.log(`📐 Content height: ${contentHeight}px → ${snapped}px`);

      await page.setViewport({ width: 1080, height: snapped, deviceScaleFactor: 2 });
      await page.evaluate(h => {
        document.body.style.height = h + 'px';
        document.querySelector('.card').style.height = h + 'px';
      }, snapped);

      const screenshot = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1080, height: snapped },
        omitBackground: false,
      });
      writeFileSync(outputPath, screenshot);
    }

    console.log(`✅ Card saved: ${outputPath}`);
    return outputPath;
  } finally {
    await browser.close();
  }
}
