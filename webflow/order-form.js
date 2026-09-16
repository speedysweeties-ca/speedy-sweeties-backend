/*
 * Speedy Sweeties Webflow order form
 *
 * Paste this file into the page-level code immediately before </body>. Keep
 * this source-controlled copy in sync with the published Webflow custom code.
 */
(function () {
  const normalizeOptionalAddressField = (value) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized || null;
  };

  const buildAddressAccessFields = (documentRef) => ({
    unitNumber: normalizeOptionalAddressField(
      documentRef.getElementById("Unit-Number")?.value
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
    const existingPaymentIds = [
      "Payment-Method---Cash",
      "Payment-Method---Debit",
      "Payment-Method---Visa-Mastercard"
    ];

    let paymentInputs = existingPaymentIds
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    const keepOnePaymentSelected = (selectedInput) => {
      if (!selectedInput.checked) return;

      paymentInputs.forEach((other) => {
        if (other !== selectedInput) other.checked = false;
      });
    };

    paymentInputs.forEach((input) => {
      input.addEventListener("change", function () {
        keepOnePaymentSelected(this);
      });
    });

    const backendFormHosts = new Set([
      "speedy-sweeties.webflow.io",
      "www.speedysweeties.ca"
    ]);
    if (!backendFormHosts.has(window.location.hostname)) return;

    const form = document.getElementById("email-form");
    if (!form) return;

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

    const combinedCardInput = document.getElementById(
      "Payment-Method---Visa-Mastercard"
    );

    if (combinedCardInput) {
      const combinedWrapper = combinedCardInput.closest("label");
      const combinedLabel = combinedWrapper
        ? combinedWrapper.querySelector(".w-form-label")
        : null;

      combinedCardInput.name = "Payment-Method---Visa";
      combinedCardInput.dataset.name = "Payment Method - Visa";

      if (combinedLabel) {
        combinedLabel.textContent = "Visa";
        combinedLabel.setAttribute("for", combinedCardInput.id);
      }

      const mastercardWrapper = document.createElement("label");
      mastercardWrapper.className = "w-checkbox";

      const mastercardInput = document.createElement("input");
      mastercardInput.type = "checkbox";
      mastercardInput.id = "Payment-Method---Mastercard";
      mastercardInput.name = "Payment-Method---Mastercard";
      mastercardInput.dataset.name = "Payment Method - Mastercard";
      mastercardInput.className = "w-checkbox-input";

      const mastercardLabel = document.createElement("span");
      mastercardLabel.className = "form-checkbox-label w-form-label";
      mastercardLabel.setAttribute("for", mastercardInput.id);
      mastercardLabel.textContent = "Mastercard";

      mastercardWrapper.append(mastercardInput, mastercardLabel);
      combinedWrapper.insertAdjacentElement("afterend", mastercardWrapper);

      paymentInputs = [...paymentInputs, mastercardInput];

      mastercardInput.addEventListener("change", function () {
        keepOnePaymentSelected(this);
      });
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

    const showError = (message) => {
      if (errorText) errorText.textContent = message;
      if (errorPanel) errorPanel.style.display = "block";
    };

    form.addEventListener(
      "submit",
      async function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (errorPanel) errorPanel.style.display = "none";

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
          showError("The email addresses do not match.");
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

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.value = "Submitting order...";
        }

        try {
          const response = await fetch(
            "https://speedy-api-lbfe.onrender.com/api/v1/orders",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(payload)
            }
          );

          const result = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(
              result.message ||
                "The order could not be created. Please try again."
            );
          }

          const orderNumber =
            result.order && result.order.orderNumber
              ? result.order.orderNumber
              : "created";

          if (successText) {
            successText.textContent =
              "Thank you — order #" +
              orderNumber +
              " has been received. We’ll contact you shortly to confirm availability and delivery time. Most deliveries take 15–45 minutes.";
          }

          form.style.display = "none";
          if (successPanel) successPanel.style.display = "block";
        } catch (error) {
          showError(
            error instanceof Error
              ? error.message
              : "The order could not be created. Please try again."
          );
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.value = originalButtonText;
          }
        }
      },
      true
    );
  });
})();
