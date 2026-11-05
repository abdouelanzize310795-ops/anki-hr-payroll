// Rend une page HTML en PNG : node render.cjs <jobs.json>
const { chromium } = require("../../node_modules/playwright-core");
(async () => {
  const jobs = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
  const browser = await chromium.launch({ channel: "chrome" });
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h } });
    await page.setContent(j.html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: j.out });
    await page.close();
  }
  await browser.close();
})();
