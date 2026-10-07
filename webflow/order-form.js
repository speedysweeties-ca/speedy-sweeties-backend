(function () {
  const normalizeOptionalAddressField = (value) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized || null;
  };

  const buildAddressAccessFields = (documentRef) => ({
    unitNumber: normalizeOptionalAddressField(
      (documentRef.getElementById("Apartment-Unit-Number") || documentRef.getElementById("Unit-Number"))?.value
    ),
    buzzCode: normalizeOptionalAddressField(
      documentRef.getElementById("Buzz-Code")?.value
    )
  });

  if (typeof module === "object" && module.exports) {
    module.exports = {
      buildAddressAccessFields,
      normalizeOptionalAddressField
    };
    return;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const backendFormHosts = new Set([
      "speedy-sweeties.webflow.io",
      "www.speedysweeties.ca",
      "speedysweeties.ca"
    ]);
    if (!backendFormHosts.has(window.location.hostname)) return;

    const form = document.getElementById("email-form");
    if (!form || form.dataset.speedyOrderFormInitialized === "true") return;
    form.dataset.speedyOrderFormInitialized = "true";

    const createOptionalAddressInput = ({
      columnClassName,
      id,
      label,
      name,
      placeholder
    }) => {
      const column = document.createElement("div");
      column.className = columnClassName;

      const inputLabel = document.createElement("label");
      inputLabel.className = "contact-us-field-label";
      inputLabel.htmlFor = id;
      inputLabel.textContent = label;

      const input = document.createElement("input");
      input.className = "contact-us-text-field w-input";
      input.id = id;
      input.name = name;
      input.dataset.name = label;
      input.maxLength = 50;
      input.placeholder = placeholder;
      input.type = "text";

      column.append(inputLabel, input);
      return column;
    };

    const ensureAddressAccessFields = () => {
      // The live Webflow form already has native optional address fields.
      if (document.getElementById("Apartment-Unit-Number")) return;
      const addressInput = document.getElementById("Address");
      const addressWrapper = addressInput ? addressInput.closest("div") : null;
      if (!addressInput || !addressWrapper) return;

      const addressLabel = addressWrapper.querySelector(
        `label[for="${addressInput.id}"]`
      );
      if (addressLabel) {
        addressLabel.innerHTML =
          'Street Address <span class="text-span-3">*</span>';
      }

      if (
        document.getElementById("Unit-Number") ||
        document.getElementById("Buzz-Code")
      ) {
        return;
      }

      const accessFieldsRow = document.createElement("div");
      accessFieldsRow.className = "w-layout-hflex form-flex-block";
      accessFieldsRow.dataset.addressAccessFields = "true";

      accessFieldsRow.append(
        createOptionalAddressInput({
          columnClassName: "form-block-column-1",
          id: "Unit-Number",
          label: "Apartment / Unit Number (Optional)",
          name: "Unit-Number",
          placeholder: "e.g. 4B"
        }),
        createOptionalAddressInput({
          columnClassName: "form-block-column-2",
          id: "Buzz-Code",
          label: "Buzz Code (Optional)",
          name: "Buzz-Code",
          placeholder: "e.g. 1234"
        })
      );

      addressWrapper.insertAdjacentElement("afterend", accessFieldsRow);
    };

    ensureAddressAccessFields();

    // Keep the optional access fields understandable on touch and desktop.
    const optionalFieldExamples = {
      "Apartment-Unit-Number": "e.g. 4B",
      "Buzz-Code": "e.g. 1234"
    };
    for (const [id, placeholder] of Object.entries(optionalFieldExamples)) {
      const field = document.getElementById(id);
      if (field) field.setAttribute("placeholder", placeholder);
    }

    const paymentOptions = [
      { id: "Payment-Method---Cash", value: "CASH", label: "Cash" },
      { id: "Payment-Method---Debit", value: "DEBIT", label: "Debit (no fee)" },
      { id: "Payment-Method---Visa-Mastercard", value: "VISA", label: "Visa (surcharge)" },
      { id: "Payment-Method---Mastercard", value: "MASTERCARD", label: "Mastercard (surcharge)" }
    ];
    const combinedCardInput = document.getElementById(
      "Payment-Method---Visa-Mastercard"
    );
    const combinedWrapper = combinedCardInput?.closest("label");
    if (combinedWrapper && !document.getElementById("Payment-Method---Mastercard")) {
      const mastercardWrapper = document.createElement("label");
      const mastercardInput = document.createElement("input");
      mastercardInput.id = "Payment-Method---Mastercard";
      const mastercardLabel = document.createElement("span");
      mastercardLabel.className = "form-checkbox-label w-form-label";
      mastercardWrapper.append(mastercardInput, mastercardLabel);
      combinedWrapper.insertAdjacentElement("afterend", mastercardWrapper);
    }

    // One native, required radio group also supports normal keyboard navigation.
    const paymentInputs = paymentOptions.map(({ id, value, label }) => {
      const input = document.getElementById(id);
      if (!input) return null;
      input.type = "radio";
      input.name = "paymentMethod";
      input.value = value;
      input.required = true;
      input.dataset.name = "Payment method";
      input.className = "w-radio-input";
      input.style.cssText = "margin:0;float:none;flex-shrink:0;";
      const wrapper = input.closest("label");
      if (wrapper) {
        wrapper.className = "w-radio";
        wrapper.htmlFor = id;
        wrapper.style.cssText = "display:inline-flex;align-items:center;gap:0.4rem;margin:0;max-width:100%;";
        const text = wrapper.querySelector(".w-form-label");
        if (text) {
          text.textContent = label;
          text.removeAttribute("for");
        }
      }
      return input;
    }).filter(Boolean);
    const paymentGroup = paymentInputs[0]?.closest("label")?.parentElement;
    if (paymentGroup) {
      paymentGroup.setAttribute("role", "radiogroup");
      paymentGroup.setAttribute("aria-label", "Payment method");
      paymentGroup.setAttribute("aria-required", "true");
      paymentGroup.style.flexWrap = "wrap";
      paymentGroup.style.gap = "8px 16px";
      const groupLabel = paymentGroup.previousElementSibling;
      if (groupLabel?.matches("label")) groupLabel.removeAttribute("for");
    }

    const paymentMap = {
      "Payment-Method---Cash": "CASH",
      "Payment-Method---Debit": "DEBIT",
      "Payment-Method---Visa-Mastercard": "VISA",
      "Payment-Method---Mastercard": "MASTERCARD"
    };

    const parseItems = (rawItems) =>
      rawItems
        .split(/[\n,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const quantityWithX = entry.match(/^(\d{1,3})\s*[x×]\s*(.+)$/i);
          const quantityWithSpace = entry.match(/^(\d{1,3})\s+(.+)$/);

          if (quantityWithX || quantityWithSpace) {
            const match = quantityWithX || quantityWithSpace;
            const quantity = Number(match[1]);

            if (quantity >= 1 && quantity <= 100) {
              return {
                name: match[2].trim(),
                quantity,
                unitPrice: 0,
                totalPrice: 0
              };
            }
          }

          return {
            name: entry,
            quantity: 1,
            unitPrice: 0,
            totalPrice: 0
          };
        });

    const formWrapper = form.closest(".w-form");
    const successPanel = formWrapper
      ? formWrapper.querySelector(".w-form-done")
      : null;
    const errorPanel = formWrapper
      ? formWrapper.querySelector(".w-form-fail")
      : null;
    const errorText = errorPanel ? errorPanel.querySelector("div") : null;
    const successText = successPanel ? successPanel.querySelector("div") : null;
    const submitButton = form.querySelector('[type="submit"]');

    // Keep Webflow's existing labels/ARIA while making custom errors perceivable.
    if (errorPanel) {
      if (!errorPanel.hasAttribute("role")) errorPanel.setAttribute("role", "alert");
      if (!errorPanel.hasAttribute("aria-live")) errorPanel.setAttribute("aria-live", "assertive");
      if (!errorPanel.hasAttribute("aria-atomic")) errorPanel.setAttribute("aria-atomic", "true");
      if (!errorPanel.hasAttribute("tabindex")) errorPanel.tabIndex = -1;
    }
    if (errorText && !errorText.id) errorText.id = "speedy-order-error-message";

    let errorField = null;
    let previousFieldInvalid = null;
    let addedErrorDescription = false;
    const clearError = () => {
      if (errorField) {
        if (errorField.getAttribute("aria-invalid") === "true") {
          if (previousFieldInvalid === null) errorField.removeAttribute("aria-invalid");
          else errorField.setAttribute("aria-invalid", previousFieldInvalid);
        }
        if (addedErrorDescription && errorText) {
          const descriptions = (errorField.getAttribute("aria-describedby") || "")
            .split(/\s+/).filter((id) => id && id !== errorText.id);
          if (descriptions.length) errorField.setAttribute("aria-describedby", descriptions.join(" "));
          else errorField.removeAttribute("aria-describedby");
        }
        errorField = null;
        addedErrorDescription = false;
      }
      if (errorPanel) errorPanel.style.display = "none";
    };

    const showError = (message, field = null) => {
      clearError();
      if (errorText) errorText.textContent = message;
      if (errorPanel) errorPanel.style.display = "block";
      if (field) {
        errorField = field;
        previousFieldInvalid = field.getAttribute("aria-invalid");
        field.setAttribute("aria-invalid", "true");
        if (errorText) {
          const descriptions = (field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
          addedErrorDescription = !descriptions.includes(errorText.id);
          if (addedErrorDescription) descriptions.push(errorText.id);
          field.setAttribute("aria-describedby", descriptions.join(" "));
        }
      }
      (field || errorPanel)?.focus();
    };
    for (const id of ["Email", "Confirm-Email"]) {
      document.getElementById(id)?.addEventListener("input", () => {
        if (errorField) clearError();
      });
    }

    // Own only the hours/submission gate. Webflow retains control of the
    // button's disabled property for its separate Turnstile protection.
    const statusUrl = "https://speedy-api-lbfe.onrender.com/api/v1/business/status";
    const closedMessage =
      "Ordering is currently unavailable while Speedy Sweeties is closed.";
    let businessState = "checking";
    let nextOpenText = "";
    let pendingStatus = null;
    let submitting = false;
    let unconfirmedOrder = false;
    const unconfirmedMessage =
      "We can't confirm whether your order was received. To avoid a duplicate order, call dispatch at 519-826-8097 before placing it again. Your entered details have been kept.";

    const showUnconfirmedOrder = () => {
      unconfirmedOrder = true;
      showError(unconfirmedMessage);
    };

    const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    const isKnownRejection = (response, result) => {
      if (!response) return false;
      if (response.status === 429) return true;
      if (!isRecord(result) || result.success !== false) return false;
      if (response.status === 503) return result.code === "ADDRESS_CHECK_UNAVAILABLE";
      if (response.status === 409) return result.message === closedMessage;
      if (response.status !== 400) return false;
      return result.code === "INVALID_DELIVERY_ADDRESS" ||
        (Array.isArray(result.errors) && result.errors.length > 0 &&
          result.errors.every((error) => isRecord(error) &&
            typeof error.path === "string" && typeof error.message === "string"));
    };

    const orderStatuses = new Set([
      "PLACED", "DISPATCHED", "ACCEPTED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"
    ]);
    const isOrderAcknowledgement = (result) => isRecord(result) && result.success === true &&
      isRecord(result.order) &&
      typeof result.order.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.order.id) &&
      Number.isSafeInteger(result.order.orderNumber) && result.order.orderNumber > 0 &&
      orderStatuses.has(result.order.orderStatus);

    const requestOrder = async (payload) => {
      const controller = new AbortController();
      let response = null;
      let timeout;
      try {
        const result = await Promise.race([
          (async () => {
            response = await fetch("https://speedy-api-lbfe.onrender.com/api/v1/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: controller.signal
            });
            return await response.json();
          })(),
          new Promise((_, reject) => {
            timeout = setTimeout(() => {
              controller.abort();
              reject(new Error("Order acknowledgement timed out"));
            }, 20000);
          })
        ]);
        return { response, result };
      } catch {
        // Missing/unreadable bodies are ambiguous except the pre-controller 429.
        return { response, result: null };
      } finally {
        clearTimeout(timeout);
      }
    };

    const hoursNotice = document.createElement("p");
    hoursNotice.id = "speedy-order-hours";
    hoursNotice.setAttribute("role", "status");
    hoursNotice.setAttribute("aria-live", "polite");
    hoursNotice.style.cssText =
      "padding:12px 16px;margin:16px 0;line-height:1.5;font-size:16px;border-radius:6px;";

    const submitGate = document.createElement("fieldset");
    submitGate.id = "speedy-order-submit-gate";
    submitGate.style.cssText = "border:0;padding:0;margin:0;min-width:0;width:100%;";
    if (submitButton) {
      submitButton.before(hoursNotice, submitGate);
      submitGate.append(submitButton);
      const describedBy = submitButton.getAttribute("aria-describedby") || "";
      submitButton.setAttribute("aria-describedby",
        (describedBy + " " + hoursNotice.id).trim());
    } else {
      form.append(hoursNotice);
    }

    const renderBusinessState = () => {
      submitGate.disabled = submitting || unconfirmedOrder || businessState === "checking" ||
        businessState === "closed";
      hoursNotice.dataset.state = businessState;
      hoursNotice.style.background = businessState === "closed" ? "#ffe8e8" : "#edf2fa";
      hoursNotice.style.color = businessState === "closed" ? "#781d1d" : "#182d4b";
      let message = "Checking whether we're open for delivery…";
      if (businessState === "open") message = "We're open for delivery.";
      if (businessState === "closed") {
        message = closedMessage + (nextOpenText ? " " + nextOpenText : "");
      }
      if (businessState === "unknown") {
        message = "We can't confirm our hours right now. You can try placing an order or call 519-826-8097.";
      }
      hoursNotice.textContent = message;
    };

    const refreshBusinessStatus = () => {
      if (pendingStatus) return pendingStatus;
      pendingStatus = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(statusUrl, {
            cache: "no-store", credentials: "omit", signal: controller.signal
          });
          if (!response.ok) throw new Error("Hours unavailable");
          const status = await response.json();
          if (!status || status.success !== true ||
              typeof status.isOpen !== "boolean") throw new Error("Invalid hours");
          // Match the backend: a fallback response is not confirmed open or closed.
          businessState = status.source === "google_places"
            ? (status.isOpen ? "open" : "closed") : "unknown";
          nextOpenText = businessState === "closed" && typeof status.nextOpenText === "string"
            ? status.nextOpenText.trim() : "";
        } catch {
          // Keep the backend's existing fallback policy during provider outages.
          businessState = "unknown";
          nextOpenText = "";
        } finally {
          clearTimeout(timeout);
          renderBusinessState();
          pendingStatus = null;
        }
        return businessState;
      })();
      return pendingStatus;
    };

    renderBusinessState();
    refreshBusinessStatus();
    const refreshVisibleHours = () => {
      // A background response must not overwrite a closure returned by order POST.
      if (!document.hidden && !submitting && !unconfirmedOrder && form.style.display !== "none") {
        refreshBusinessStatus();
      }
    };
    setInterval(refreshVisibleHours, 60000);
    document.addEventListener("visibilitychange", refreshVisibleHours);
    window.addEventListener("pageshow", refreshVisibleHours);
    window.addEventListener("online", refreshVisibleHours);

    form.addEventListener(
      "submit",
      async function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (submitting) return;
        if (unconfirmedOrder) {
          showUnconfirmedOrder();
          return;
        }

        clearError();

        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        const email = document
          .getElementById("Email")
          .value.trim()
          .toLowerCase();
        const confirmedEmail = document
          .getElementById("Confirm-Email")
          .value.trim()
          .toLowerCase();

        if (email !== confirmedEmail) {
          showError("The email addresses do not match.", document.getElementById("Confirm-Email"));
          return;
        }

        const selectedPayments = paymentInputs.filter((input) => input.checked);

        if (selectedPayments.length !== 1) {
          showError("Please select one payment method.");
          return;
        }

        const items = parseItems(document.getElementById("Items").value);

        if (items.length === 0) {
          showError("Please enter at least one item.");
          return;
        }

        const notes = [];
        const additionalNotes = document
          .getElementById("Additional-Notes")
          .value.trim();

        if (additionalNotes) notes.push(additionalNotes);

        const emptiesInput = document.getElementById("Marketing");
        if (emptiesInput && emptiesInput.checked) {
          notes.push("Customer has empties to return.");
        }

        const payload = {
          customerName: document.getElementById("Name-5").value.trim(),
          customerPhone: document.getElementById("Phone").value.trim(),
          customerEmail: email,
          addressLine1: document.getElementById("Address").value.trim(),
          ...buildAddressAccessFields(document),
          city: document.getElementById("City").value.trim(),
          province: "Ontario",
          notes: notes.join("\n"),
          items,
          subtotal: 0,
          deliveryFee: 0,
          tax: 0,
          tip: 0,
          discount: 0,
          total: 0,
          paymentMethod: paymentMap[selectedPayments[0].id]
        };

        const originalButtonText = submitButton ? submitButton.value : "";

        submitting = true;
        renderBusinessState();
        if (submitButton) {
          submitButton.value = "Checking opening hours...";
        }

        try {
          if (!window.speedyAddress) throw new Error("Address checking is still loading. Please refresh this page or call 519-826-8097.");
          if (submitButton) submitButton.value = "Checking address...";
          await window.speedyAddress.verify();
          if (payload.addressLine1 !== document.getElementById("Address").value.trim() || payload.city !== document.getElementById("City").value.trim()) throw new Error("Your address changed. Please submit again.");
          // Recheck at submission, including when a tab has stayed open past closing.
          if (await refreshBusinessStatus() === "closed") return;
          if (!window.speedyAddress.matches(payload)) throw new Error("Your address changed. Please select it again.");
          if (submitButton) submitButton.value = "Submitting order...";
          const { response, result } = await requestOrder(payload);

          if (isKnownRejection(response, result)) {
            if (response.status === 409 && result?.message === closedMessage) {
              businessState = "closed";
              nextOpenText = "";
              renderBusinessState();
            }
            throw new Error(
              (typeof result?.message === "string" && result.message.trim()) ||
                "The order could not be created. Please try again."
            );
          }

          if (!response?.ok || !isOrderAcknowledgement(result)) {
            showUnconfirmedOrder();
            return;
          }

          const orderNumber = result.order.orderNumber;

          if (successText) {
            successText.textContent =
              "Thank you — order #" +
              orderNumber +
              " has been received. We’ll contact you shortly to confirm availability and delivery time. Most deliveries take 15–45 minutes.";
          }

          form.style.display = "none";
          if (successPanel) successPanel.style.display = "block";
          document.dispatchEvent(new CustomEvent("speedy:order-created", {
            detail: { trackingToken: result.trackingToken, order: result.order }
          }));
        } catch (error) {
          showError(
            error instanceof Error
              ? error.message
              : "The order could not be created. Please try again."
          );
        } finally {
          submitting = false;
          renderBusinessState();
          if (submitButton) {
            submitButton.value = originalButtonText;
          }
        }
      },
      true
    );
  });
})();
