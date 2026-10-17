const { chromium } = require("C:/Users/FY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const mockOrigin = "https://mock.supabase.test";
const duoduoUrl = "http://127.0.0.1:4180/";
const jiajiaUrl = "http://127.0.0.1:4181/";
const users = {
  duoduo: { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", token: "duoduo-token", name: "多多", code: "DUO123", partner: null },
  jiajia: { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", token: "jiajia-token", name: "佳嘉", code: "JIA123", partner: null }
};
let transactions = [
  {
    id: "duo-private",
    owner_id: users.duoduo.id,
    type: "expense",
    amount: 6600,
    category_id: "exp-study",
    account: "微信",
    date: "2026-10-17",
    note: "多多的秘密",
    visibility: "private",
    created_at: "2026-10-17T01:00:00.000Z",
    updated_at: "2026-10-17T01:00:00.000Z"
  },
  {
    id: "duo-shared",
    owner_id: users.duoduo.id,
    type: "expense",
    amount: 1800,
    category_id: "exp-food",
    account: "支付宝",
    date: "2026-10-17",
    note: "多多请佳嘉喝奶茶",
    visibility: "partner",
    created_at: "2026-10-17T02:00:00.000Z",
    updated_at: "2026-10-17T02:00:00.000Z"
  },
  {
    id: "jia-private",
    owner_id: users.jiajia.id,
    type: "expense",
    amount: 9900,
    category_id: "exp-home",
    account: "银行卡",
    date: "2026-10-16",
    note: "佳嘉的小金库",
    visibility: "private",
    created_at: "2026-10-16T01:00:00.000Z",
    updated_at: "2026-10-16T01:00:00.000Z"
  },
  {
    id: "jia-shared",
    owner_id: users.jiajia.id,
    type: "expense",
    amount: 3200,
    category_id: "exp-fun",
    account: "微信",
    date: "2026-10-16",
    note: "佳嘉买的电影票",
    visibility: "partner",
    created_at: "2026-10-16T02:00:00.000Z",
    updated_at: "2026-10-16T02:00:00.000Z"
  }
];
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function json(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders,
    body: JSON.stringify(data)
  });
}

async function configureApp(context, appName, user) {
  await context.addInitScript(({ appName, user }) => {
    const prefix = appName === "duoduo" ? "duoduo" : "jiajia";
    localStorage.setItem(`${prefix}-cloud-config-v1`, JSON.stringify({
      url: "https://mock.supabase.test",
      anonKey: "test-anon-key-which-is-long-enough-for-client-validation"
    }));
    localStorage.setItem(`${prefix}-cloud-session-v1`, JSON.stringify({
      accessToken: user.token,
      refreshToken: `${user.token}-refresh`,
      expiresAt: Date.now() + 3600000,
      user: { id: user.id, email: `${user.name}@example.com` }
    }));
  }, { appName, user });
}

function userFromRequest(request) {
  const auth = request.headers().authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return Object.values(users).find((user) => user.token === token) || null;
}

async function handleApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
  const current = userFromRequest(request);
  if (!current) return json(route, { message: "Not signed in" }, 401);

  if (url.pathname === "/rest/v1/profiles" && request.method() === "GET") {
    const id = (url.searchParams.get("id") || "").replace(/^eq\./, "");
    const visibleIds = [current.id, current.partner].filter(Boolean);
    if (!visibleIds.includes(id)) return json(route, []);
    const user = Object.values(users).find((item) => item.id === id);
    return json(route, user ? [{
      id: user.id,
      display_name: user.name,
      invite_code: user.code,
      partner_id: user.partner
    }] : []);
  }

  if (url.pathname === "/rest/v1/rpc/claim_invite" && request.method() === "POST") {
    const body = JSON.parse(request.postData());
    const inviter = Object.values(users).find((user) => user.code === String(body.input_code).toUpperCase());
    if (!inviter || inviter.id === current.id || inviter.partner || current.partner) {
      return json(route, { message: "无法完成配对" }, 400);
    }
    inviter.partner = current.id;
    current.partner = inviter.id;
    return json(route, { partner_id: inviter.id, display_name: inviter.name });
  }

  if (url.pathname === "/rest/v1/transactions" && request.method() === "GET") {
    const visible = transactions.filter((item) => {
      if (item.owner_id === current.id) return true;
      return item.visibility === "partner" && current.partner === item.owner_id;
    });
    return json(route, visible);
  }

  if (url.pathname === "/rest/v1/transactions" && request.method() === "POST") {
    const body = JSON.parse(request.postData());
    const row = {
      id: `created-${Date.now()}-${transactions.length}`,
      owner_id: current.id,
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    transactions = [row, ...transactions];
    return json(route, [row], 201);
  }

  return json(route, []);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  });
  const duoduoContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const jiajiaContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await configureApp(duoduoContext, "duoduo", users.duoduo);
  await configureApp(jiajiaContext, "jiajia", users.jiajia);
  await duoduoContext.route(`${mockOrigin}/**`, handleApi);
  await jiajiaContext.route(`${mockOrigin}/**`, handleApi);

  const duoduo = await duoduoContext.newPage();
  const jiajia = await jiajiaContext.newPage();
  const errors = [];
  for (const page of [duoduo, jiajia]) {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
  }

  try {
    await Promise.all([
      duoduo.goto(duoduoUrl, { waitUntil: "networkidle" }),
      jiajia.goto(jiajiaUrl, { waitUntil: "networkidle" })
    ]);

    await jiajia.click('.tab[data-view="settings"]');
    await jiajia.fill("#pairCodeInput", users.duoduo.code);
    await jiajia.click('[data-cloud-action="pair"]');
    await jiajia.waitForFunction(() => document.querySelector("#cloudPanel").textContent.includes("已配对"));

    await duoduo.evaluate(() => window.dispatchEvent(new Event("focus")));
    await duoduo.waitForTimeout(600);
    await duoduo.click('.tab[data-view="settings"]');
    await duoduo.waitForFunction(() => document.querySelector("#cloudPanel").textContent.includes("佳嘉"));
    await duoduo.click('.tab[data-view="home"]');
    await jiajia.click('.tab[data-view="home"]');
    await duoduo.waitForTimeout(400);
    await jiajia.waitForTimeout(400);

    const duoduoText = await duoduo.locator("#recentList").textContent();
    const jiajiaText = await jiajia.locator("#recentList").textContent();
    assert(duoduoText.includes("多多的秘密"), "多多看不到自己的私密账单");
    assert(duoduoText.includes("多多请佳嘉喝奶茶"), "多多看不到自己的共享账单");
    assert(duoduoText.includes("佳嘉买的电影票"), "多多看不到佳嘉的共享账单");
    assert(!duoduoText.includes("佳嘉的小金库"), "多多不应看到佳嘉的私密账单");
    assert(jiajiaText.includes("佳嘉的小金库"), "佳嘉看不到自己的私密账单");
    assert(jiajiaText.includes("佳嘉买的电影票"), "佳嘉看不到自己的共享账单");
    assert(jiajiaText.includes("多多请佳嘉喝奶茶"), "佳嘉看不到多多的共享账单");
    assert(!jiajiaText.includes("多多的秘密"), "佳嘉不应看到多多的私密账单");

    await duoduo.locator("#recentList .bill-row", { hasText: "佳嘉买的电影票" }).click();
    assert(await duoduo.locator("#readonlyBanner").isVisible(), "多多查看佳嘉共享账单时不是只读");
    assert(await duoduo.locator("#saveButton").isHidden(), "多多不应能保存佳嘉的共享账单");
    await duoduo.click("#sheetClose");

    await jiajia.locator("#recentList .bill-row", { hasText: "多多请佳嘉喝奶茶" }).click();
    assert(await jiajia.locator("#readonlyBanner").isVisible(), "佳嘉查看多多共享账单时不是只读");
    assert(await jiajia.locator("#saveButton").isHidden(), "佳嘉不应能保存多多的共享账单");
    await jiajia.click("#sheetClose");

    await duoduo.click("#tabAddButton");
    await duoduo.fill("#amountInput", "5.20");
    await duoduo.click('[data-category="exp-gift"]');
    await duoduo.click('[data-visibility="partner"]');
    await duoduo.fill("#dateInput", "2026-10-17");
    await duoduo.fill("#noteInput", "跨应用新共享");
    await duoduo.click("#saveButton");
    await duoduo.waitForFunction(() => document.querySelector("#sheetLayer").hidden);
    await jiajia.evaluate(() => window.dispatchEvent(new Event("focus")));
    await jiajia.waitForFunction(() => document.querySelector("#recentList").textContent.includes("跨应用新共享"));

    assert(errors.length === 0, `浏览器错误：\n${errors.join("\n")}`);
    console.log(JSON.stringify({
      ok: true,
      paired: true,
      duoduoSeesSharedFromJiajia: true,
      jiajiaSeesSharedFromDuoduo: true,
      privateRecordsIsolated: true,
      partnerEntriesReadOnly: true,
      liveRefreshAcrossApps: true
    }, null, 2));
  } finally {
    await duoduoContext.close();
    await jiajiaContext.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
