/**
 * Capture screenshots of AnkibaPay pages (local dev).
 * Usage: node scripts/capture-screenshots.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.APP_URL || "http://localhost:8080";
const OUT = path.resolve("screenshots");
const VIEWPORT = { width: 1440, height: 900 };

const PUBLIC_PAGES = [
  { slug: "01-login", path: "/login" },
  { slug: "02-signup", path: "/signup" },
];

const HR_PAGES = [
  { slug: "10-dashboard", path: "/" },
  { slug: "11-companies", path: "/companies" },
  { slug: "12-employees", path: "/employees" },
  { slug: "13-recruitment", path: "/recruitment" },
  { slug: "14-contracts", path: "/contracts" },
  { slug: "15-attendance", path: "/attendance" },
  { slug: "16-leave", path: "/leave" },
  { slug: "17-helpdesk", path: "/helpdesk" },
  { slug: "18-payroll", path: "/payroll" },
  { slug: "19-accounting", path: "/accounting" },
  { slug: "20-transfers", path: "/transfers" },
  { slug: "21-training", path: "/training" },
  { slug: "22-performance", path: "/performance" },
  { slug: "23-tasks", path: "/tasks" },
  { slug: "24-documents", path: "/documents" },
  { slug: "25-assets", path: "/assets" },
  { slug: "26-reports", path: "/reports" },
  { slug: "27-notifications", path: "/notifications" },
  { slug: "28-ai", path: "/ai" },
  { slug: "29-subscriptions", path: "/subscriptions" },
  { slug: "30-settings", path: "/settings" },
];

const ADMIN_PAGES = [
  { slug: "40-admin-dashboard", path: "/" },
  { slug: "41-admin-console", path: "/admin" },
  { slug: "42-admin-companies", path: "/companies" },
  { slug: "43-admin-settings", path: "/settings" },
];

const HR_EMAIL = process.env.HR_EMAIL || "rh.comores@ankibapay.test";
const HR_PASSWORD = process.env.HR_PASSWORD || "Ap-RhComores01";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "abdouelanze95@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Irsoid269*";

async function shot(page, slug) {
  const file = path.join(OUT, `${slug}.png`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: file, fullPage: true });
  console.log("✓", slug);
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").click();
  await page.locator("#email").fill("");
  await page.locator("#email").type(email, { delay: 20 });
  await page.locator("#password").click();
  await page.locator("#password").fill("");
  await page.locator("#password").type(password, { delay: 20 });
  await page.click('button[type="submit"]');
  try {
    await page.waitForFunction(
      () => !window.location.pathname.includes("/login"),
      null,
      { timeout: 45000 },
    );
  } catch {
    const err = await page.locator("form .text-destructive, form [class*='destructive']").allTextContents();
    await page.screenshot({ path: path.join(OUT, `login-fail-${email.split("@")[0]}.png`), fullPage: true });
    throw new Error(`Login échoué pour ${email}: ${err.join(" | ") || page.url()}`);
  }
  await page.waitForTimeout(1500);
  console.log("  →", email, "→", page.url());
  if (page.url().includes("/change-password")) {
    console.warn("! Compte doit changer le mot de passe:", email);
  }
}

async function captureSet(page, pages, prefix = "") {
  for (const p of pages) {
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 45000 });
      await shot(page, p.slug);
    } catch (err) {
      console.error("✗", p.slug, err.message);
      try {
        await page.screenshot({ path: path.join(OUT, `${p.slug}-error.png`), fullPage: true });
      } catch {
        /* ignore */
      }
    }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  console.log("Base URL:", BASE);
  console.log("Output:", OUT);

  // Public
  for (const p of PUBLIC_PAGES) {
    await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle" });
    await shot(page, p.slug);
  }

  // HR / employer workspace (max pages)
  console.log("\n— Connexion RH —");
  await login(page, HR_EMAIL, HR_PASSWORD);
  await captureSet(page, HR_PAGES);

  // Platform admin
  console.log("\n— Connexion Admin —");
  await context.clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  // Clear storage
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await captureSet(page, ADMIN_PAGES);

  await browser.close();
  console.log("\nTerminé. Captures dans:", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
