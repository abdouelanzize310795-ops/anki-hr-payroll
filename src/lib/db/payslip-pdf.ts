import puppeteer, { type Browser } from "puppeteer-core";
import { SESSION_COOKIE } from "./auth";

/**
 * Renders /print/payslip/:id in headless Chromium with the caller's session and
 * returns a PDF — so the PDF is exactly the employer's payslip template.
 */

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
    void browserPromise.then((b) => b.on("disconnected", () => (browserPromise = null)));
  }
  return browserPromise;
}

const INTERNAL_ORIGIN = `http://127.0.0.1:${process.env.PORT || 8080}`;

export async function renderPayslipPdf(payslipId: string, sessionToken: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setCookie({ name: SESSION_COOKIE, value: sessionToken, url: INTERNAL_ORIGIN, httpOnly: true });
    await page.emulateMediaType("print");
    // The payslip is server-rendered: wait for its markup, not for the network to go idle
    // (the dev server keeps a live-reload connection open).
    const res = await page.goto(`${INTERNAL_ORIGIN}/print/payslip/${payslipId}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    if (!res || res.status() >= 400) throw new Error("Bulletin introuvable");
    const ready = await page
      .waitForSelector("[data-payslip-ready] .payslip-print", { timeout: 30_000 })
      .catch(() => null);
    if (!ready) throw new Error("Bulletin introuvable ou non accessible");
    // Give web fonts and the logo a moment, without blocking on slow networks.
    await Promise.race([
      page.evaluate(() => document.fonts.ready.then(() => true)),
      new Promise((r) => setTimeout(r, 5_000)),
    ]);
    await page
      .waitForNetworkIdle({ idleTime: 500, timeout: 5_000 })
      .catch(() => undefined);
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close().catch(() => undefined);
  }
}
