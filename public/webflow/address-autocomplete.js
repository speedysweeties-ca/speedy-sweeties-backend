/* Google address suggestions for the existing Webflow order form. */
(() => {
  const API = "https://speedy-api-lbfe.onrender.com/api/v1/addresses/";
  function init() {
    const input = document.getElementById("Address");
    const city = document.getElementById("City");
    const form = document.getElementById("email-form");
    if (!input || !city || !form || window.speedyAddress) return;
    const unit = document.getElementById("Apartment-Unit-Number") || document.getElementById("Unit-Number");
    const buzz = document.getElementById("Buzz-Code");
    let timer, generation = 0, active = -1, suggestions = [], selected = null;
    let controller = null, session = crypto.randomUUID(), sessionStarted = Date.now();

    const helper = document.createElement("p");
    helper.id = "speedy-address-help";
    helper.setAttribute("role", "status");
    helper.style.cssText = "font-size:14px;line-height:1.5;margin:4px 0 10px;color:#333;";
    helper.textContent = "Start typing your house number and street, then choose your address below.";
    const box = document.createElement("div");
    box.hidden = true;
    box.style.cssText = "background:white;color:#222;border:1px solid #777;border-radius:5px;margin-bottom:12px;overflow:hidden;";
    const list = document.createElement("ul");
    list.id = "speedy-address-options";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Address suggestions");
    list.style.cssText = "list-style:none;padding:0;margin:0;";
    const attribution = document.createElement("div");
    attribution.textContent = "Google Maps";
    attribution.translate = false;
    attribution.style.cssText = "font:400 12px Arial,sans-serif;letter-spacing:normal;white-space:nowrap;color:#5e5e5e;padding:8px 12px;text-align:right;";
    box.append(list, attribution);
    input.after(helper, box);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), helper.id].filter(Boolean).join(" "));
    input.autocomplete = "off";

    const close = () => {
      box.hidden = true; active = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    };
    const cancel = () => { clearTimeout(timer); controller?.abort(); controller = null; generation++; };
    const key = () => input.value.trim() + "|" + city.value.trim();
    const message = (text, invalid = false) => {
      helper.textContent = text;
      helper.style.color = invalid ? "#a31515" : "#333";
      if (invalid) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    };
    const request = async (action, body, signal) => {
      const timeout = new AbortController();
      const abort = () => timeout.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) timeout.abort();
      const clock = setTimeout(abort, 8000);
      try {
        const response = await fetch(API + action, { method: "POST",
          headers: { "Content-Type": "application/json" }, credentials: "omit",
          referrerPolicy: "no-referrer", cache: "no-store",
          body: JSON.stringify(body), signal: timeout.signal });
        const data = await response.json();
        if (!response.ok || data.success !== true) throw new Error(data.message || "Address checking is unavailable.");
        return data;
      } finally { clearTimeout(clock); signal?.removeEventListener("abort", abort); }
    };
    const freshSession = () => {
      if (Date.now() - sessionStarted > 150000) {
        session = crypto.randomUUID(); sessionStarted = Date.now();
      }
      return session;
    };
    async function choose(index) {
      const suggestion = suggestions[index];
      if (!suggestion) return;
      cancel(); close(); selected = null;
      const version = generation;
      const before = key();
      controller = new AbortController();
      message("Checking the selected address…");
      try {
        const data = await request("details", { placeId: suggestion.placeId, sessionToken: session }, controller.signal);
        if (version !== generation || key() !== before) return;
        const address = data.address;
        if (!address || typeof address.addressLine1 !== "string" || typeof address.city !== "string") throw new Error("Please select a complete street address.");
        // Existing service-area choices remain authoritative; don't invent a new city option.
        const option = [...city.options].find((item) => item.value.trim().toLowerCase() === address.city.toLowerCase());
        if (!option || !option.value) throw new Error("For delivery outside Guelph, please call or text 519-826-8097.");
        input.value = address.addressLine1;
        city.value = option.value;
        if (unit && address.unitNumber) unit.value = address.unitNumber;
        selected = key();
        message("Address selected. Please check the house number, and enter any apartment or buzz code separately.");
      } catch (error) {
        if (version !== generation) return;
        message(error.name === "AbortError" ? "Address checking timed out. Please try again or call 519-826-8097." : error.message, true);
      } finally {
        if (version === generation) { session = crypto.randomUUID(); sessionStarted = Date.now(); }
      }
    }
    async function search() {
      const value = input.value.trim();
      if (value.length < 3) { close(); return; }
      const version = generation;
      controller = new AbortController();
      message("Finding addresses…");
      try {
        const data = await request("suggestions", { input: value, sessionToken: freshSession() }, controller.signal);
        if (version !== generation || value !== input.value.trim()) return;
        suggestions = Array.isArray(data.suggestions) ? data.suggestions.slice(0, 5) : [];
        list.replaceChildren();
        suggestions.forEach((item, index) => {
          const option = document.createElement("li");
          option.id = "speedy-address-option-" + index;
          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", "false");
          option.textContent = item.description;
          option.style.cssText = "padding:12px;cursor:pointer;border-bottom:1px solid #eee;line-height:1.4;font-size:16px;";
          option.addEventListener("mousedown", event => event.preventDefault());
          option.addEventListener("click", () => choose(index));
          list.append(option);
        });
        active = -1; box.hidden = !suggestions.length;
        input.setAttribute("aria-expanded", String(!box.hidden));
        message(suggestions.length ? "Choose your full address from the list." : "No matching address found. Check the house number and spelling, or call 519-826-8097.", !suggestions.length);
      } catch (error) {
        if (version !== generation) return;
        close();
        message("Address suggestions are unavailable. Please try again or call 519-826-8097 to order.", true);
      }
    }
    input.addEventListener("input", () => {
      const changedSelection = selected !== null;
      cancel(); selected = null; close();
      if (changedSelection) { if (unit) unit.value = ""; if (buzz) buzz.value = ""; }
      message("Start typing your house number and street, then choose your address below.");
      timer = setTimeout(search, 300);
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") { cancel(); close(); return; }
      if (box.hidden || !suggestions.length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        active = (active + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
        [...list.children].forEach((option, index) => {
          option.setAttribute("aria-selected", String(index === active));
          option.style.background = index === active ? "#e8efff" : "white";
        });
        input.setAttribute("aria-activedescendant", list.children[active].id);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (active >= 0) choose(active);
      }
    });
    input.addEventListener("blur", () => { setTimeout(close, 150); });
    city.addEventListener("change", () => { cancel(); selected = null; close(); message("Please choose an address for the selected city."); });
    window.speedyAddress = {
      matches(address) { return selected === key() && selected === address.addressLine1.trim() + "|" + address.city.trim(); },
      async verify() {
        const snapshot = key();
        if (!selected || selected !== snapshot) {
          input.focus();
          throw new Error("Please choose your full street address from the Google suggestions. If it isn't listed, call 519-826-8097.");
        }
        message("Checking your delivery address…");
        try {
          const data = await request("verify", { addressLine1: input.value.trim(), city: city.value.trim(), province: "Ontario" });
          if (!data.verified || key() !== snapshot || selected !== snapshot) throw new Error("Your address changed. Please select it again.");
          message("Delivery address checked.");
          return true;
        } catch (error) { message(error.message, true); input.focus(); throw error; }
      }
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
