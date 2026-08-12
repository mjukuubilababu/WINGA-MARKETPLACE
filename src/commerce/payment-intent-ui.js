(() => {
  function createPaymentIntentUiModule(deps = {}) {
    const {
      createElement,
      translate = (_key, _variables, fallbackText) => fallbackText,
      formatProductPrice = (value) => String(value ?? ""),
      getNavigator = () => window.navigator
    } = deps;
    const t = (key, fallbackText = "", variables = {}) => translate(key, variables, fallbackText);

    function createPaymentIntentContent({ product, paymentDetails = {}, state = {} } = {}) {
      if (!product || typeof createElement !== "function") return null;
      const wrapper = createElement("div", { className: "payment-intent-shell" });
      wrapper.append(
        createElement("p", { className: "eyebrow", textContent: t("order.checkoutEyebrow", "Mobile Money checkout") }),
        createElement("h3", { textContent: t("order.submitReferenceTitle", "Submit payment reference"), attributes: { id: "payment-intent-title" } }),
        createElement("p", { className: "product-meta", textContent: t("order.submitReferenceHelp", "Lipa kwanza, kisha weka receipt au transaction reference ili order ihifadhiwe pending verification.") })
      );

      const summary = createElement("div", { className: "payment-intent-summary" });
      const provider = paymentDetails.provider ? String(paymentDetails.provider).replace(/_/g, " ").toUpperCase() : t("order.mobileMoney", "Mobile Money");
      summary.append(
        createElement("strong", { textContent: product.name || t("common.product", "Product") }),
        createElement("p", { className: "product-meta", textContent: t("order.amountLabel", "Amount: {amount}", { amount: formatProductPrice(product.price) }) }),
        createElement("p", { className: "product-meta", textContent: t("order.paymentNumberLabel", "Payment number: {number}", { number: paymentDetails.number || t("common.notSet", "Not set") }) }),
        createElement("p", { className: "product-meta", textContent: t("order.recipientLabel", "Recipient: {recipient}", { recipient: paymentDetails.recipientName || t("order.sellerFallback", "Seller") }) }),
        createElement("p", { className: "product-meta", textContent: t("order.providerLabel", "Provider: {provider}", { provider }) }),
        createElement("p", { className: "product-meta", textContent: t("order.reservationWindow", "Reservation window: 24 hours pending verification") })
      );
      if (paymentDetails.instructions) summary.append(createElement("p", { className: "auth-note", textContent: paymentDetails.instructions }));

      const safetyCard = createElement("div", { className: "payment-safety-card" });
      safetyCard.append(
        createElement("strong", { textContent: t("order.safetyTitle", "Safety check before you pay") }),
        createElement("p", { className: "product-meta", textContent: t("order.safetyVerifyBody", "Verify the recipient name and amount, then enter the payment reference here.") }),
        createElement("p", { className: "product-meta", textContent: t("order.safetyReportBody", "If details do not match or the seller pressures you to pay elsewhere, report the seller first.") })
      );

      const input = createElement("input", { attributes: { id: "payment-intent-transaction-input", type: "text", maxlength: "80", placeholder: t("order.referencePlaceholder", "Enter receipt or transaction reference"), value: state.transactionId || "", autocomplete: "off", autocapitalize: "characters" } });
      const offline = getNavigator()?.onLine === false;
      const statusMessage = offline ? t("order.offlineKeepReference", "You are offline. Keep this reference and submit when the internet returns.") : state.loading ? t("order.sendingKeepOpen", "We are sending your reference. Keep this window open.") : state.feedbackMessage;
      if (statusMessage) wrapper.append(createElement("p", { className: `payment-intent-status is-${offline ? "warning" : state.loading ? "info" : state.feedbackTone || "info"}`, textContent: statusMessage }));

      const actions = createElement("div", { className: "payment-intent-actions" });
      const submit = createElement("button", { className: "action-btn buy-btn", textContent: state.loading ? t("order.submitting", "Submitting...") : t("order.submitReferenceAction", "Submit reference"), attributes: { type: "button", "data-submit-payment-intent": "true" } });
      if (state.loading) { submit.disabled = true; input.disabled = true; }
      actions.append(
        submit,
        createElement("button", { className: "action-btn action-btn-secondary", textContent: t("trust.reportSeller", "Report seller"), attributes: { type: "button", "data-report-seller": product.uploadedBy || "", "data-report-product-context": product.id || "" } }),
        createElement("button", { className: "action-btn action-btn-secondary", textContent: t("order.messageSeller", "Message seller"), attributes: { type: "button", "data-payment-open-chat": "true" } }),
        createElement("button", { className: "action-btn action-btn-secondary", textContent: t("common.cancel", "Cancel"), attributes: { type: "button", "data-close-payment-intent": "true" } })
      );
      wrapper.append(summary, safetyCard, input, createElement("p", { className: "auth-note", textContent: t("order.referenceProviderHelp", "Use the payment reference supplied by your mobile money provider.") }), actions);
      return { wrapper, input };
    }

    return { createPaymentIntentContent };
  }

  window.WingaModules.commerce.createPaymentIntentUiModule = createPaymentIntentUiModule;
})();
