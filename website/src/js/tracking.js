/* Website-only tracking. Uses the existing API; never creates or modifies orders. */
(() => {
  "use strict";
  if (window.speedySite?.live !== true) return;
  const KEY = "speedy.order-tracking.v1";
  const LIFETIME = 48 * 60 * 60 * 1000;
  const API = "https://speedy-api-lbfe.onrender.com/api/v1/orders/track-token/";
  const stages = [
    ["PLACED", "Order received", "Your order has reached Speedy Sweeties."],
    ["DISPATCHED", "Sent to driver", "Awaiting driver acceptance."],
    ["ACCEPTED", "Driver accepted", "A driver has accepted your delivery."],
    ["OUT_FOR_DELIVERY", "On the way", "Your items have been picked up and are on the way."],
    ["DELIVERED", "Delivered", "Your delivery is complete. Thank you for choosing Speedy Sweeties!"]
  ];
  const validToken = token => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
  const numberText = value => typeof value === "number" || typeof value === "string" ? String(value).slice(0, 30) : "";

  function init() {
    const form = document.getElementById("email-form");
    const wrapper = form && form.closest(".w-form");
    if (!wrapper || document.getElementById("track-my-order")) return;
    let records = [];
    let current = null;
    let timer;
    let expiryTimer;
    let requestTimeout;
    let controller;
    let generation = 0;
    let busy = false;
    let stopped = false;
    let lastData = null;
    let failures = 0;
    let storageAvailable = true;
    let lastStorageRaw = null;
    let panelIntersecting = false;

    const panel = document.createElement("section");
    panel.id = "track-my-order";
    panel.hidden = true;
    panel.setAttribute("aria-labelledby", "ss-track-title");
    // Only static markup is assigned as HTML. API values are always textContent.
    panel.innerHTML = `
      <h2 id="ss-track-title" tabindex="-1">Track my order</h2>
      <div data-role="selector" hidden><label for="ss-track-select">Choose an order</label><select id="ss-track-select"></select></div>
      <p class="ss-track-order" data-role="order"></p>
      <p data-role="status" role="status" aria-live="polite"></p>
      <p class="ss-track-order" data-role="total" role="status" aria-live="polite" hidden></p>
      <ol class="ss-track-steps" aria-label="Delivery progress" hidden></ol>
      <p class="ss-track-error" data-role="error" role="status" hidden></p>
      <p class="ss-track-meta" data-role="updated"></p>
      <div class="ss-track-controls">
        <button type="button" data-action="refresh">Refresh status</button>
        <button type="button" data-action="copy">Copy private tracking link</button>
        <a class="ss-track-call" href="tel:5198268097">Call dispatch</a>
      </div>
      <p class="ss-track-meta" data-role="notice"></p>
      <p class="ss-track-meta" data-role="copy-status" role="status"></p>
      <div data-role="link-fallback" hidden><label for="ss-track-link">Copy this private link</label><input id="ss-track-link" type="text" readonly spellcheck="false" autocomplete="off"></div>
      <button type="button" class="ss-track-forget" data-action="forget">Forget this order on this browser</button>`;
    wrapper.insertAdjacentElement("beforebegin", panel);
    const get = role => panel.querySelector(`[data-role="${role}"]`);
    const button = action => panel.querySelector(`[data-action="${action}"]`);
    const steps = panel.querySelector("ol");
    let checkInFrame = null;
    window.addEventListener("message", event => {
      if (event.origin !== "https://speedy-api-lbfe.onrender.com" || event.source !== checkInFrame?.contentWindow || event.data?.type !== "speedy:check-in-height") return;
      const height = Number(event.data.height);
      if (Number.isFinite(height)) checkInFrame.style.height = Math.min(6000, Math.max(400, height + 10)) + "px";
    });
    const select = panel.querySelector("select");
    for (const [, label] of stages) {
      const li = document.createElement("li");
      li.className = "ss-track-step";
      const title = document.createElement("strong");
      title.textContent = label;
      li.append(title, document.createElement("span"));
      steps.append(li);
    }
    const shortcut = document.createElement("a");
    shortcut.id = "speedy-track-shortcut";
    shortcut.href = "#track-my-order";
    shortcut.textContent = "Track my order";
    shortcut.hidden = true;
    document.body.append(shortcut);
    // Keep the shortcut from covering controls while the tracker itself is visible.
    if (typeof IntersectionObserver === "function") {
      const observer = new IntersectionObserver(entries => {
        panelIntersecting = entries[0].isIntersecting;
        shortcut.hidden = panel.hidden || panelIntersecting;
      }, { rootMargin: "-100px 0px 0px 0px" });
      observer.observe(panel);
    }
    const updateScrollMargin = () => {
      const headerHeight = document.querySelector(".w-nav")?.getBoundingClientRect().height || 100;
      panel.style.scrollMarginTop = Math.ceil(headerHeight + 20) + "px";
    };
    window.addEventListener("resize", updateScrollMargin);
    updateScrollMargin();
    const focusPanel = () => {
      updateScrollMargin();
      panel.scrollIntoView({ block: "start" });
      panel.querySelector("h2").focus({ preventScroll: true });
    };
    shortcut.addEventListener("click", event => { event.preventDefault(); focusPanel(); });

    function live(record, now = Date.now()) {
      return record && validToken(record.token) && Number.isFinite(record.savedAt) &&
        record.savedAt <= now && now - record.savedAt < LIFETIME;
    }
    function parseRecords(raw) {
      try {
        const parsed = JSON.parse(raw || "[]");
        if (!Array.isArray(parsed)) return [];
        const seen = new Set();
        return parsed.filter(record => {
          if (!live(record) || seen.has(record.token)) return false;
          seen.add(record.token);
          return true;
        }).slice(0, 5).map(record => ({ token: record.token, orderNumber: numberText(record.orderNumber), savedAt: record.savedAt }));
      } catch { return []; }
    }
    function notice() {
      get("notice").textContent = storageAvailable
        ? "This browser stores your order’s private tracking link for 48 hours, then removes it while this page is active or on your next visit. Keep your tracking link private."
        : "This page keeps your order’s private tracking link for up to 48 hours, but your browser cannot save changes to remembered orders. Copy the private tracking link to return to it.";
    }
    function save() {
      try {
        const stored = window.localStorage.getItem(KEY);
        lastStorageRaw = stored;
        const value = records.length ? JSON.stringify(records) : null;
        // Avoid storage-event ping-pong and delete expired tokens, not just their UI.
        if (stored !== value) {
          if (value === null) window.localStorage.removeItem(KEY);
          else window.localStorage.setItem(KEY, value);
        }
        lastStorageRaw = value;
        storageAvailable = true;
      }
      catch { storageAvailable = false; }
      notice();
    }
    function scheduleExpiry() {
      clearTimeout(expiryTimer);
      if (records.length) {
        const deadline = Math.min(...records.map(record => record.savedAt + LIFETIME));
        expiryTimer = setTimeout(expire, Math.max(0, deadline - Date.now()));
      }
    }
    function expire() {
      let incoming = records;
      let readable = false;
      try {
        const raw = window.localStorage.getItem(KEY);
        readable = true;
        // Reconcile before any retention write: another tab may have changed
        // storage while this tab was suspended, before its storage event arrived.
        // If a write failed, retain unsaved memory until storage actually changes.
        if (storageAvailable || raw !== lastStorageRaw) {
          incoming = parseRecords(raw);
          incoming.forEach(record => {
            const previous = records.find(item => item.token === record.token);
            if (previous) record.savedAt = Math.min(record.savedAt, previous.savedAt);
          });
        }
        lastStorageRaw = raw;
      } catch { storageAvailable = false; notice(); }
      const retained = incoming.filter(record => live(record));
      const changed = JSON.stringify(retained) !== JSON.stringify(records);
      records = retained;
      const selected = current && records.find(record => record.token === current.token);
      if (readable || changed) save();
      if ((current && !selected) || (!current && changed && records.length)) {
        // choose() cancels pending work and scrubs all old order/token DOM.
        choose(records[0]);
        return true;
      }
      if (selected) current = selected;
      if (changed) options();
      scheduleExpiry();
      return false;
    }
    function syncStorage() {
      expire();
    }
    function options() {
      select.replaceChildren();
      if (!current && records.length) {
        const prompt = document.createElement("option");
        prompt.value = "";
        prompt.textContent = "Choose a saved order";
        select.append(prompt);
      }
      records.forEach((record, index) => {
        const option = document.createElement("option");
        option.value = record.token;
        option.textContent = record.orderNumber ? "Order #" + record.orderNumber : "Recent order " + (index + 1);
        select.append(option);
      });
      get("selector").hidden = current ? records.length < 2 : !records.length;
      if (current) select.value = current.token;
    }
    function error(message) {
      get("error").textContent = message;
      get("error").hidden = !message;
    }
    function cancel() {
      generation++;
      clearTimeout(timer);
      clearTimeout(requestTimeout);
      if (controller) controller.abort();
      controller = null;
      busy = false;
      button("refresh").disabled = false;
    }
    function render(data) {
      const index = stages.findIndex(stage => stage[0] === data.orderStatus);
      const cancelled = data.orderStatus === "CANCELLED";
      const delivered = data.orderStatus === "DELIVERED";
      if (delivered && !checkInFrame) {
        checkInFrame = document.createElement("iframe");
        checkInFrame.title = "Sweetie Check-In: receipt, app rewards and delivery support";
        checkInFrame.src = "https://speedy-api-lbfe.onrender.com/track/?embedded=1#" + current.token;
        checkInFrame.referrerPolicy = "no-referrer";
        checkInFrame.allow = "web-share; clipboard-write";
        checkInFrame.style.cssText = "width:100%;height:1400px;border:0;display:block;margin-top:20px;";
        panel.append(checkInFrame);
      }
      if (index === -1 && !cancelled) throw new Error("Unknown order status");
      lastData = data;
      stopped = cancelled || delivered;
      const num = numberText(data.orderNumber);
      if (num && current.orderNumber !== num) {
        current.orderNumber = num;
        save(); options();
      }
      get("order").textContent = current.orderNumber ? "Order #" + current.orderNumber : "Your delivery";
      get("status").textContent = cancelled ? "Order cancelled. Please call dispatch if you have any questions." : stages[index][1] + " — " + stages[index][2];
      const total = get("total"), amount = data.receiptTotal;
      const ready = data.orderStatus === "OUT_FOR_DELIVERY" || delivered;
      const valid = typeof amount === "number" && Number.isFinite(amount) && amount >= 0;
      total.hidden = cancelled;
      total.textContent = cancelled ? "" : !ready
        ? "Total will appear when your order is out for delivery."
        : valid
          ? (delivered ? "Final order total: " : "Total to pay at the door: ") + amount.toLocaleString("en-CA", { style: "currency", currency: "CAD" })
          : "Your final total is being confirmed. Please call dispatch if you need it.";
      steps.hidden = cancelled;
      [...steps.children].forEach((li, i) => {
        li.dataset.state = i < index || delivered ? "complete" : i === index ? "current" : "pending";
        li.querySelector("span").textContent = i < index || delivered ? "Complete" : i === index ? "Current step" : "Waiting";
        if (i === index) li.setAttribute("aria-current", "step");
        else li.removeAttribute("aria-current");
      });
      get("updated").textContent = "Last checked at " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (stopped ? "." : ". Updates automatically every 15 seconds while this page is open.");
      button("refresh").hidden = stopped;
      error("");
    }
    function schedule(delay) {
      clearTimeout(timer);
      if (current && !stopped && !document.hidden) timer = setTimeout(refresh, delay);
    }
    async function refresh() {
      // Retention is independent of polling, terminal status, visibility and network.
      if (expire()) return;
      if (!current || busy || stopped || document.hidden) return;
      clearTimeout(timer);
      if (!navigator.onLine) {
        error("You appear to be offline. Reconnect to get the latest delivery status.");
        schedule(30000); return;
      }
      const requestGeneration = generation;
      const token = current.token;
      busy = true;
      button("refresh").disabled = true;
      controller = new AbortController();
      const requestController = controller;
      const timeout = requestTimeout = setTimeout(() => requestController.abort(), 12000);
      const requestIsCurrent = () => {
        expire();
        return requestGeneration === generation && current?.token === token;
      };
      let delay = 15000;
      try {
        const response = await fetch(API + encodeURIComponent(token), { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: requestController.signal });
        if (!requestIsCurrent()) return;
        if ([401, 403, 404, 410].includes(response.status)) {
          records = records.filter(record => record.token !== token);
          save(); choose(records[0]);
          if (!current) {
            panel.hidden = false; shortcut.hidden = panelIntersecting;
            get("status").textContent = "Tracking link unavailable";
            error("This tracking link has expired or is no longer available. Your order has not been cancelled by this message. Please call dispatch for an update.");
          }
          return;
        }
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(900000, Math.max(60000, retryAfter * 1000)) : 60000;
          throw new Error("Rate limited");
        }
        if (!response.ok) throw new Error("Request failed");
        const result = await response.json();
        if (!requestIsCurrent()) return;
        if (!result.success || !result.data) throw new Error("Invalid response");
        render(result.data);
        failures = 0;
      } catch {
        if (!requestIsCurrent()) return;
        failures++;
        delay = Math.max(delay, Math.min(60000, 15000 * Math.pow(2, Math.min(failures, 2))));
        if (!lastData) get("status").textContent = "Waiting for a delivery update";
        error("We cannot refresh your order right now. " + (lastData ? "The status and total shown are the last confirmed update. " : "") + "We’ll retry automatically, or you can call dispatch.");
      } finally {
        clearTimeout(timeout);
        if (requestIsCurrent()) {
          busy = false; controller = null;
          button("refresh").disabled = false;
          schedule(delay);
        }
      }
    }
    function choose(record, initialData) {
      cancel();
      checkInFrame?.remove(); checkInFrame = null;
      current = live(record) ? record : null;
      lastData = null; stopped = false; failures = 0;
      panel.hidden = !current;
      shortcut.hidden = !current || panelIntersecting;
      steps.hidden = true;
      [...steps.children].forEach(li => {
        delete li.dataset.state;
        li.removeAttribute("aria-current");
        li.querySelector("span").textContent = "";
      });
      get("order").textContent = "";
      get("status").textContent = "";
      get("updated").textContent = "";
      get("total").textContent = ""; get("total").hidden = true;
      get("copy-status").textContent = "";
      get("link-fallback").hidden = true;
      get("link-fallback").querySelector("input").value = "";
      button("refresh").hidden = !current;
      button("copy").hidden = !current;
      button("forget").hidden = !current;
      error(""); options(); notice(); scheduleExpiry();
      if (!current) return;
      get("order").textContent = current.orderNumber ? "Order #" + current.orderNumber : "Your delivery";
      get("status").textContent = "Checking your order…";
      if (initialData) { try { render(initialData); } catch { /* Tracking GET will resolve the status. */ } }
      refresh();
    }
    function remember(token, orderNumber, initialData) {
      if (!validToken(token)) return false;
      const known = records.find(record => record.token === token);
      expire();
      if (known && !live(known)) return false;
      const previous = records.find(record => record.token === token);
      const savedAt = Math.min(known?.savedAt ?? Date.now(), previous?.savedAt ?? Date.now());
      const record = { token, orderNumber: numberText(orderNumber) || previous?.orderNumber || known?.orderNumber || "", savedAt };
      records = [record, ...records.filter(item => item.token !== token)].slice(0, 5);
      save(); choose(record, initialData); return true;
    }

    button("refresh").addEventListener("click", refresh);
    select.addEventListener("change", () => {
      const token = select.value;
      if (!expire()) choose(records.find(record => record.token === token));
    });
    button("forget").addEventListener("click", () => {
      if (expire()) return;
      records = records.filter(record => record.token !== current?.token);
      save(); choose(records[0]);
      if (!current) form.querySelector("input")?.focus();
    });
    button("copy").addEventListener("click", async () => {
      if (expire()) return;
      if (!current) return;
      const copyGeneration = generation;
      const token = current.token;
      const url = window.location.origin + "/#track=" + token;
      try {
        await navigator.clipboard.writeText(url);
        expire();
        if (generation === copyGeneration && current?.token === token) get("copy-status").textContent = "Private tracking link copied. Anyone with this link can view this order’s status and associated order-tracking information.";
      } catch {
        expire();
        if (generation !== copyGeneration || current?.token !== token) return;
        get("link-fallback").hidden = false;
        const input = get("link-fallback").querySelector("input");
        input.value = url; input.focus(); input.select();
        get("copy-status").textContent = "Select and copy the link below. Keep it private.";
      }
    });
    document.addEventListener("speedy:order-created", event => {
      const detail = event.detail || {};
      if (remember(detail.trackingToken, detail.order?.orderNumber, detail.order)) focusPanel();
      else {
        choose(null);
        panel.hidden = false; shortcut.hidden = panelIntersecting;
        steps.hidden = true;
        get("order").textContent = ""; get("updated").textContent = "";
        get("copy-status").textContent = ""; get("link-fallback").hidden = true;
        get("status").textContent = "Your order was received.";
        button("copy").hidden = true; button("refresh").hidden = true; button("forget").hidden = true;
        error("Online tracking is unavailable for this order. Please call dispatch for an update. Do not submit the order again.");
        focusPanel();
      }
    });
    const resume = () => { syncStorage(); refresh(); };
    document.addEventListener("visibilitychange", () => {
      clearTimeout(timer);
      expire();
      if (!document.hidden) resume();
    });
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("storage", event => {
      if (event.key !== KEY && event.key !== null) return;
      // Read the latest value: queued storage events can contain stale newValue.
      if (event.storageArea) {
        try { if (event.storageArea !== window.localStorage) return; }
        catch { storageAvailable = false; }
      }
      syncStorage();
    });
    try { records = parseRecords(window.localStorage.getItem(KEY)); save(); }
    catch { storageAvailable = false; }
    function openLink() {
      const linkedToken = window.speedyTrackingLink;
      const invalidLink = window.speedyTrackingLinkInvalid;
      delete window.speedyTrackingLink;
      delete window.speedyTrackingLinkInvalid;
      if (linkedToken) { remember(linkedToken); focusPanel(); }
      else {
        choose(records[0]);
        if (invalidLink) {
          panel.hidden = false;
          error("This tracking link is invalid. Please use the complete private link or call dispatch.");
          focusPanel();
        }
      }
    }
    document.addEventListener("speedy:tracking-link-opened", openLink);
    openLink();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
