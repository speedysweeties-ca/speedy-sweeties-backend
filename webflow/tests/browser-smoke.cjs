// Run against a downloaded published page, with every network request intercepted.
// PLAYWRIGHT_PATH, CHROMIUM_PATH, TRACKING_TEST_HTML and TRACKING_TEST_CSS are local paths.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const html = fs.readFileSync(process.env.TRACKING_TEST_HTML, "utf8");
const css = fs.readFileSync(process.env.TRACKING_TEST_CSS, "utf8");
const assets = process.env.TRACKING_TEST_ASSETS ? JSON.parse(fs.readFileSync(process.env.TRACKING_TEST_ASSETS, "utf8")) : {};
const TOKEN = "A".repeat(43);
const origin = process.env.TRACKING_TEST_ORIGIN || "https://www.speedysweeties.ca";
const output = process.env.TRACKING_TEST_OUTPUT || "/tmp";
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox", "--disable-gpu"], headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const posts = [];
  let status = "PLACED";
  let calls = 0;
  let networkFailure = false;
  const json = (route, body, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  await context.route("**/*", async route => {
    const req = route.request(); const url = req.url();
    if (url.startsWith("https://speedy-api-lbfe.onrender.com/api/v1/orders")) {
      if (req.method() === "POST") {
        posts.push(req.postDataJSON());
        return json(route, { success: true, trackingToken: TOKEN, order: { orderNumber: 123, orderStatus: "PLACED" } }, 201);
      }
      assert.match(url, /\/track-token\/A{43}$/); calls++;
      if (networkFailure) return route.abort();
      return json(route, { success: true, data: { orderNumber: 123, orderStatus: status } });
    }
    if (req.isNavigationRequest()) return route.fulfill({ contentType: "text/html", body: html });
    if (req.resourceType() === "stylesheet") return route.fulfill({ contentType: "text/css", body: css });
    // Simulate the anti-bot provider only in this fully intercepted offline test.
    if (url.includes("challenges.cloudflare.com/turnstile/")) return route.fulfill({ contentType: "application/javascript", body: "window.turnstile={render(node,options){options.callback('offline-test-only');return 'test';}};" });
    if (req.resourceType() === "script") return route.fulfill({ contentType: "application/javascript", body: assets[url] || (url.includes("webfont") ? "window.WebFont={load(){}};" : "") });
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(origin + "/");
    assert.equal(await page.locator("#track-my-order").isVisible(), false);
    const values = { "Name-5": "Test Customer", Phone: "5195550101", Email: "test@example.com", "Confirm-Email": "test@example.com", Address: "10 Test Street", "Apartment-Unit-Number": "4B", "Buzz-Code": "456", Items: "2 x Cola, 3 Bags of ice", "Additional-Notes": "Simulated test" };
    for (const [id, value] of Object.entries(values)) await page.locator("#" + id).fill(value);
    await page.locator("#City").selectOption({ label: "Guelph" });
    await page.locator("#Payment-Method---Debit").check();
    for (const el of await page.locator('#email-form input[type="checkbox"][required]').all()) await el.check();
    await page.locator('#email-form [type="submit"]').click();
    await page.locator('[data-role="status"]').filter({ hasText: "Order received" }).waitFor();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].unitNumber, "4B"); assert.equal(posts[0].buzzCode, "456");
    assert.deepEqual(posts[0].items.map(item => item.quantity), [2, 3]);
    await page.reload();
    await page.locator('[data-role="status"]').filter({ hasText: "Order received" }).waitFor();
    assert.equal(posts.length, 1);
    status = "ACCEPTED"; await page.locator('[data-action="refresh"]').click();
    await page.locator('[data-role="status"]').filter({ hasText: "Driver assigned" }).waitFor();
    // Advance the real browser clock to exercise automatic polling.
    await page.clock.install();
    status = "OUT_FOR_DELIVERY";
    await page.locator('[data-action="refresh"]').click();
    await page.locator('[data-role="status"]').filter({ hasText: "On the way" }).waitFor();
    const panel = page.locator("#track-my-order");
    await panel.screenshot({ path: path.join(output, "tracking-desktop.png") });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await panel.scrollIntoViewIfNeeded();
      assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), true, "Panel must not overflow at " + width);
      for (const el of await panel.locator("button:visible,a:visible").all()) {
        const box = await el.boundingBox(); const p = await panel.boundingBox();
        assert.ok(box.x >= p.x && box.x + box.width <= p.x + p.width + 1, "Control fits mobile panel");
        assert.ok(box.height >= 44, "Touch target is at least 44px");
      }
      // A taller capture shows the entire panel without the sticky site header over it.
      await page.setViewportSize({ width, height: 1400 });
      await panel.evaluate(el => el.scrollIntoView({ block: "start" }));
      const titleBounds = await panel.locator("h2").boundingBox();
      const headerBounds = await page.locator(".w-nav").boundingBox();
      assert.ok(titleBounds.y >= headerBounds.y + headerBounds.height, "Tracker title clears the sticky navigation");
      await page.screenshot({ path: path.join(output, "tracking-mobile-" + width + ".png") });
    }
    networkFailure = true; await page.locator('[data-action="refresh"]').click();
    await page.locator('[data-role="error"]').filter({ hasText: "last confirmed" }).waitFor();
    networkFailure = false; status = "DELIVERED";
    await page.clock.fastForward(31000);
    await page.locator('[data-role="status"]').filter({ hasText: "Delivered" }).waitFor();
    const afterDelivery = calls;
    await page.clock.fastForward(60000);
    assert.equal(calls, afterDelivery);
    // New browser page, cleared storage: link restores access and scrubs the fragment.
    await page.evaluate(() => localStorage.clear());
    await page.goto(origin + "/#track=" + TOKEN);
    await page.waitForURL(origin + "/#track-my-order");
    await page.locator('[data-role="status"]').filter({ hasText: "Delivered" }).waitFor();
    assert.equal(page.url(), origin + "/#track-my-order");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("speedy.order-tracking.v1"))[0].token), TOKEN);
    await page.reload();
    await page.locator('[data-role="status"]').filter({ hasText: "Delivered" }).waitFor();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, simulatedOrders: posts.length, trackingRequests: calls, viewportWidths: [1440, 390, 320], browserErrors: errors, checks: ["submit", "reload", "stages", "mobile", "connection-failure", "automatic-retry", "terminal-polling-stop", "private-link", "URL-scrub"] }));
  } catch (error) {
    await page.screenshot({ path: path.join(output, "tracking-failure.png"), fullPage: false });
    console.error("Failed at page", page.url(), "status", await page.locator('[data-role="status"]').textContent());
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
