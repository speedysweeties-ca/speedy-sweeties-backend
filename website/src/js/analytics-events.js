(() => {
  const productionHosts = ["speedysweeties.ca", "www.speedysweeties.ca"];
  if (!productionHosts.includes(window.location.hostname)) return;

  const track = (eventName) => {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName);
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("email-form");
    let formStarted = false;
    let formSubmitted = false;
    let ageConfirmed = false;

    const trackFormStart = () => {
      if (!formStarted) {
        formStarted = true;
        track("order_request_start");
      }
    };

    if (form) {
      form.addEventListener("focusin", trackFormStart, { once: true });
      form.addEventListener("input", trackFormStart, { once: true });

      const ageConfirmation = form.querySelector("#Confirm-Age-and-ID");
      if (ageConfirmation) {
        ageConfirmation.addEventListener("change", () => {
          // Records the customer's acknowledgement, not verified age or ID.
          if (ageConfirmation.checked && !ageConfirmed) {
            ageConfirmed = true;
            track("age_confirmation");
          }
        });
      }
    }

    // Count accepted backend orders, not a visible confirmation panel.
    document.addEventListener("speedy:order-created", () => {
      if (!formSubmitted) {
        formSubmitted = true;
        track("order_request_submit");
      }
    });

    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest("a, button, input[type='submit']");
      if (!target) return;

      const href = (target.getAttribute("href") || "").trim().toLowerCase();
      const label = (target.textContent || target.value || "").replace(/\s+/g, " ").trim().toLowerCase();

      if (href.startsWith("tel:")) {
        track("phone_click");
      } else if (label.includes("order online")) {
        track("order_online_click");
      } else if (label === "contact us") {
        track("contact_us_click");
      }
    });
  });
})();
