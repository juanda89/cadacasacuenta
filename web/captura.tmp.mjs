// Captura hero, sala de situación y detalle de caso.
import { chromium } from "playwright-core";
import os from "node:os";

const BIN = `${os.homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const OUT = "/private/tmp/claude-501/-Users-jd-Desktop-Proyectos-ayudaTerremoto/e44c4cc1-3f50-41aa-a8d2-bb1e810bf97a/scratchpad";
const BASE = process.argv[2] ?? "http://127.0.0.1:3111";
const PRE = process.argv[3] ?? "v2";

const browser = await chromium.launch({
  executablePath: BIN,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/${PRE}-hero.png` });

await page.evaluate(() => document.querySelector("#mapa")?.scrollIntoView({ block: "start" }));
await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/${PRE}-sala.png` });

// clic en un racimo para verificar que se divide
const racimo = page.locator(".racimo").first();
if (await racimo.count()) {
  await racimo.click();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/${PRE}-sala-zoom.png` });
}

await page.goto(BASE + "/caso/CCC-2026-0009", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/${PRE}-caso.png`, fullPage: true });

await browser.close();
console.log("capturas listas");
