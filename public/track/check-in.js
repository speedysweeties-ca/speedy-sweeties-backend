/* No third-party scripts, analytics, local storage, or order details in shared links. */
(() => {
  "use strict";
  const token = location.hash.slice(1);
  if (new URLSearchParams(location.search).get("embedded") === "1") {
    document.documentElement.classList.add("embedded");
    const allowedParents = ["https://www.speedysweeties.ca", "https://speedysweeties.ca", "https://speedy-sweeties.webflow.io"];
    new ResizeObserver(() => {
      const message = { type: "speedy:check-in-height", height: document.body.scrollHeight };
      for (const origin of allowedParents) window.parent.postMessage(message, origin);
    }).observe(document.body);
  }
  const byId = id => document.getElementById(id);
  const money = amount => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
  let session = null, timer = null, loading = false, recordedView = false, expired = false;
  const validToken = /^[A-Za-z0-9_-]{32,256}$/.test(token);
  async function request(path, extra = {}) {
    const response = await fetch(`/api/v1/check-in/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingToken: token, ...extra }), cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.message || "We couldn't connect. Please try again or call dispatch.");
      error.status = response.status;
      throw error;
    }
    return result.data;
  }
  async function record(type) {
    try { await request("events", { type }); return true; } catch { return false; }
  }
  function render(data) {
    byId("order-label").textContent = `ORDER #${data.orderNumber}`;
    const delivered = data.orderStatus === "DELIVERED";
    byId("delivered").hidden = !delivered;
    if (!delivered) {
      const labels = { PLACED: "We've received your order.", DISPATCHED: "Your driver has been assigned.", ACCEPTED: "Your driver is collecting your order.", OUT_FOR_DELIVERY: "Your order is on its way!", CANCELLED: "This order was cancelled." };
      byId("title").textContent = labels[data.orderStatus] || "Your order is being updated.";
      byId("subtitle").textContent = data.orderStatus === "CANCELLED"
        ? "Please call dispatch if you have any questions."
        : "This page updates automatically. Keep this private link to check your delivery and view your receipt once it arrives.";
      return;
    }
    byId("title").textContent = `Delivered. Thank you${data.firstName ? `, ${data.firstName}` : ""}!`;
    byId("subtitle").textContent = "We appreciate you choosing Speedy Sweeties. Your receipt, app rewards, and delivery support are right here.";
    byId("receipt").replaceChildren();
    byId("receipt-number").textContent = data.receipt?.receiptNumber || "";
    if (data.receipt) {
      [["Items", "itemTotal"], ["Delivery", "deliveryCharge"], ["Tax / fees", "taxOrFees"], ["Order total", "grandTotal"]].forEach(([label, field]) => {
        const row = document.createElement("div"); row.className = `receipt-row${field === "grandTotal" ? " receipt-total" : ""}`;
        const name = document.createElement("span"), value = document.createElement("span");
        name.textContent = label; value.textContent = money(data.receipt[field]); row.append(name, value); byId("receipt").append(row);
      });
    } else { byId("receipt").textContent = "Your digital receipt hasn't been recorded yet. Please call dispatch if you need a copy."; }
    const loyalty = data.loyalty;
    byId("loyalty-progress").hidden = !loyalty;
    if (loyalty) {
      byId("loyalty-progress").value = loyalty.completedOrders;
      byId("loyalty").textContent = `${loyalty.completedOrders} of ${loyalty.target} qualifying app deliveries this month. ${loyalty.rewardBalance} free delivery reward${loyalty.rewardBalance === 1 ? "" : "s"} available.`;
      byId("loyalty-note").textContent = `Progress resets each calendar month; earned rewards stay available. ${loyalty.thisOrderEligible ? "This was an app order." : "Website and phone orders do not earn app loyalty progress."}`;
    } else {
      byId("loyalty").textContent = "App rewards aren't available for this order.";
      byId("loyalty-note").textContent = "Contact dispatch if you have a question about your loyalty account.";
    }
    byId("help-form").hidden = Boolean(data.helpRequest);
    byId("help-status").textContent = data.helpRequest
      ? data.helpRequest.status === "HANDLED"
        ? "Dispatch marked your request handled. If you still need help, please call us."
        : "Your request is with dispatch. We'll follow up using the contact number on your order."
      : "";
    byId("review").hidden = !data.reviewUrl;
    if (data.reviewUrl) byId("review").href = data.reviewUrl;
    if (!recordedView) { recordedView = true; void record("VIEWED").then(ok => { if (!ok) recordedView = false; }); }
  }
  async function refresh() {
    if (loading || !validToken || expired) return;
    clearTimeout(timer); loading = true; byId("refresh").disabled = true;
    try {
      session = await request("session"); render(session); byId("error").hidden = true;
    } catch (error) {
      byId("error").textContent = error.message || "Connection interrupted. Please try again."; byId("error").hidden = false;
      if ([401, 403, 404, 410].includes(error.status)) {
        expired = true; session = null; byId("delivered").hidden = true;
        byId("title").textContent = "This tracking link is unavailable.";
        byId("subtitle").textContent = "Please call dispatch for help with your order.";
      }
    } finally {
      loading = false; byId("refresh").disabled = false;
      if (!expired && !document.hidden && (!session || !["DELIVERED", "CANCELLED"].includes(session.orderStatus))) timer = setTimeout(refresh, 15000);
    }
  }
  byId("refresh").addEventListener("click", refresh);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearTimeout(timer); else void refresh(); });
  byId("help-form").addEventListener("submit", async event => {
    event.preventDefault();
    const message = byId("help-message").value.trim();
    if (message.length < 5) { byId("help-status").textContent = "Please describe what happened in at least five characters."; return; }
    byId("help-submit").disabled = true;
    try { const helpRequest = await request("help", { message }); session = { ...session, helpRequest }; render(session); }
    catch (error) { byId("help-status").textContent = error.message; }
    finally { byId("help-submit").disabled = false; }
  });
  byId("review").addEventListener("click", () => { void record("REVIEW_CLICK"); });
  byId("share").addEventListener("click", async () => {
    if (!session) return;
    void record("SHARE_CLICK");
    byId("share-status").textContent = "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Speedy Sweeties", text: "Local delivery in Guelph from Speedy Sweeties.", url: session.shareUrl });
        byId("share-status").textContent = "Thanks for spreading the word!";
      } else {
        await navigator.clipboard.writeText(session.shareUrl);
        byId("share-status").textContent = "Website link copied. You can paste it into a message to a friend.";
      }
      void record("SHARE_COMPLETED");
    } catch (error) {
      if (error.name === "AbortError") return;
      byId("share-fallback").hidden = false; byId("share-url").value = session.shareUrl;
      byId("share-url").select(); byId("share-status").textContent = "Copy this website link to share it.";
    }
  });
  if (validToken) void refresh();
  else {
    byId("title").textContent = "Open your private tracking link.";
    byId("subtitle").textContent = "Use the tracking link from your order confirmation, or call dispatch for help.";
    byId("refresh").hidden = true;
  }
})();
