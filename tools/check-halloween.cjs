const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("C:/Users/FY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const base = "http://127.0.0.1:4180/";
const shots = path.join(__dirname, "screenshots");
const halloweenTime = new Date("2026-10-30T12:00:00+08:00").getTime();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createContext(browser, colorScheme = "light") {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block"
  });
  await context.addInitScript((fixedTime) => {
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedTime]));
      }

      static now() {
        return fixedTime;
      }
    }
    window.Date = MockDate;
    localStorage.setItem("duoduo-wallet-theme-v1", "auto");
  }, halloweenTime);
  return context;
}

async function main() {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  });
  const context = await createContext(browser, "light");
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(base, { waitUntil: "networkidle" });
    assert(await page.locator("html").getAttribute("data-theme") === "halloween", "万圣节主题没有按日期自动启用");
    assert(await page.locator(".brand-hat-band").isVisible(), "品牌女巫帽没有显示");
    assert(await page.locator(".halloween-deco").isVisible(), "幽灵和糖果装饰没有显示");
    assert(await page.locator(".hero-mascot").isHidden(), "万圣节下仍显示普通云朵水印");
    assert((await page.locator('meta[name="theme-color"]').first().getAttribute("content")) === "#fff3e6", "浅色主题色没有更新");
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "浅色万圣节出现横向溢出");
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(shots, "halloween-home.png"), fullPage: true });

    await page.click("#tabAddButton");
    await page.waitForTimeout(350);
    assert(await page.locator("#noteInput").isVisible(), "万圣节记账弹层没有显示备注");
    await page.screenshot({ path: path.join(shots, "halloween-sheet.png"), fullPage: true });
    await page.keyboard.press("Escape");

    await page.click('.tab[data-view="settings"]');
    assert(await page.locator("#themeInput").inputValue() === "auto", "主题设置没有显示跟随日期");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shots, "halloween-settings.png"), fullPage: true });
    await page.selectOption("#themeInput", "daily");
    assert(await page.locator("html").getAttribute("data-theme") === "daily", "日常主题切换失败");
    assert(await page.locator(".halloween-deco").isHidden(), "日常主题仍显示万圣节装饰");
    await page.selectOption("#themeInput", "halloween");
    assert(await page.locator("html").getAttribute("data-theme") === "halloween", "手动万圣节主题切换失败");
    await context.close();

    const darkContext = await createContext(browser, "dark");
    const darkPage = await darkContext.newPage();
    darkPage.on("pageerror", (error) => errors.push(error.message));
    darkPage.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await darkPage.goto(base, { waitUntil: "networkidle" });
    assert(await darkPage.locator("html").getAttribute("data-theme") === "halloween", "深色万圣节主题没有启用");
    assert((await darkPage.locator('meta[name="theme-color"]').nth(1).getAttribute("content")) === "#17111f", "深色主题色没有更新");
    assert(!(await darkPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "深色万圣节出现横向溢出");
    await darkPage.waitForTimeout(450);
    await darkPage.screenshot({ path: path.join(shots, "halloween-dark.png"), fullPage: true });
    await darkContext.close();

    assert(errors.length === 0, `浏览器错误：\n${errors.join("\n")}`);
    console.log(JSON.stringify({
      ok: true,
      autoSeason: true,
      manualTheme: true,
      light: true,
      dark: true,
      mobile: true,
      screenshots: ["halloween-home.png", "halloween-sheet.png", "halloween-settings.png", "halloween-dark.png"]
    }, null, 2));
  } finally {
    await context.close().catch(() => {});
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
