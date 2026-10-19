const { chromium } = require("C:/Users/FY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const appUrl = process.env.APP_URL || "https://zyr123-star.github.io/duoduo-wallet/";
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const email = `codex-ui-${Date.now()}@gmail.com`;
const password = "Live-Ui-Test-Aa1!";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing live registration test environment");
  process.exit(1);
}

async function adminRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    }
  });
  const text = await response.text();
  return {
    response,
    data: text ? JSON.parse(text) : null
  };
}

async function findUser() {
  for (let page = 1; page <= 5; page += 1) {
    const result = await adminRequest(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    if (!result.response.ok) return null;
    const match = result.data?.users?.find((user) => user.email === email);
    if (match) return match;
    if (!result.data?.users?.length || result.data.users.length < 1000) return null;
  }
  return null;
}

async function cleanup() {
  const user = await findUser();
  if (user?.id) {
    await adminRequest(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(message.text())) {
      errors.push(message.text());
    }
  });

  try {
    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".brand", { timeout: 20000 });
    await page.click('.tab[data-view="settings"]');
    await page.fill("#cloudNameInput", "线上注册测试");
    await page.fill("#cloudEmailInput", email);
    await page.fill("#cloudPasswordInput", password);
    await page.click('[data-cloud-action="signup"]');
    await page.waitForFunction(() => {
      const text = document.querySelector("#cloudPanel")?.textContent || "";
      return text.includes("把这组配对码发给她") && text.includes("线上注册测试");
    }, null, { timeout: 20000 });
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem("duoduo-cloud-session-v1") || "null"));
    if (!session?.accessToken) throw new Error("注册成功后没有保存登录会话");
    const oldAccessToken = session.accessToken;
    await page.evaluate(() => {
      const key = "duoduo-cloud-session-v1";
      const current = JSON.parse(localStorage.getItem(key));
      current.expiresAt = Date.now() - 1000;
      localStorage.setItem(key, JSON.stringify(current));
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      const text = document.querySelector("#cloudPanel")?.textContent || "";
      return text.includes("把这组配对码发给她") && text.includes("线上注册测试");
    }, null, { timeout: 20000 });
    const refreshed = await page.evaluate(() => JSON.parse(localStorage.getItem("duoduo-cloud-session-v1") || "null"));
    if (!refreshed?.accessToken || refreshed.accessToken === oldAccessToken) {
      throw new Error("过期登录会话没有自动续期");
    }
    await page.waitForTimeout(500);
    await page.evaluate(() => localStorage.removeItem("duoduo-cloud-session-v1"));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      const text = document.querySelector("#cloudPanel")?.textContent || "";
      return text.includes("把这组配对码发给她") && text.includes("线上注册测试");
    }, null, { timeout: 20000 });
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("duoduo-cloud-session-v1") || "null"));
    if (!restored?.accessToken) throw new Error("手机端 IndexedDB 备用会话没有恢复登录");
    await page.evaluate(() => {
      const key = "duoduo-cloud-session-v1";
      const current = JSON.parse(localStorage.getItem(key));
      current.expiresAt = Date.now() - 1000;
      localStorage.setItem(key, JSON.stringify(current));
    });
    await context.route("https://inffbzzogiobuprkqcxf.supabase.co/**", (route) => route.abort("failed"));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      const text = document.querySelector("#cloudPanel")?.textContent || "";
      return text.includes("离线缓存") || text.includes("正在显示缓存");
    }, null, { timeout: 20000 });
    const offlineSession = await page.evaluate(() => JSON.parse(localStorage.getItem("duoduo-cloud-session-v1") || "null"));
    if (!offlineSession?.refreshToken) throw new Error("网络失败时错误清除了登录会话");
    await context.unroute("https://inffbzzogiobuprkqcxf.supabase.co/**");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      const session = JSON.parse(localStorage.getItem("duoduo-cloud-session-v1") || "null");
      return session?.expiresAt > Date.now() + 60000;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(500);
    const cookies = await context.cookies();
    if (!cookies.some((cookie) => cookie.name === "duoduo_cloud_session")) {
      throw new Error("登录会话没有写入 Cookie 备份");
    }
    await page.close();
    const cookiePage = await context.newPage();
    await cookiePage.goto("https://zyr123-star.github.io/robots.txt", { waitUntil: "domcontentloaded", timeout: 60000 });
    await cookiePage.evaluate(async () => {
      localStorage.removeItem("duoduo-cloud-session-v1");
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase("duoduo-cloud-auth-v1");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("auth db blocked"));
      });
    });
    await cookiePage.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await cookiePage.waitForFunction(() => {
      const text = document.querySelector("#cloudPanel")?.textContent || "";
      return text.includes("把这组配对码发给她") && text.includes("线上注册测试");
    }, null, { timeout: 20000 });
    const cookieRestored = await cookiePage.evaluate(() => JSON.parse(localStorage.getItem("duoduo-cloud-session-v1") || "null"));
    if (!cookieRestored?.refreshToken) throw new Error("Cookie 备用会话没有恢复登录");
    if (errors.length) throw new Error(`浏览器错误：${errors.join(" | ")}`);
    console.log(JSON.stringify({
      ok: true,
      liveRegistration: true,
      immediateLogin: true,
      expiredSessionRefreshed: true,
      indexedDbSessionRestored: true,
      offlineStartupPreservedSession: true,
      networkRecoveryRefreshedSession: true,
      cookieSessionRestored: true,
      emailConfirmationRequired: false
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
