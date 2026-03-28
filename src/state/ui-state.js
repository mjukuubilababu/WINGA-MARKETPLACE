(() => {
  function createChatUiState() {
    return {
      openEmojiScope: "",
      activeContext: null,
      currentDraft: "",
      selectedProductIds: [],
      activeReplyMessageId: "",
      openMessageMenuId: "",
      isContextOpen: false,
      messagePollingTimer: 0,
      realtimeReconnectTimer: 0
    };
  }

  function createProductDetailUiState() {
    return {
      reviewDraft: {
        productId: "",
        rating: 5,
        comment: ""
      }
    };
  }

  window.WingaModules.state.createChatUiState = createChatUiState;
  window.WingaModules.state.createProductDetailUiState = createProductDetailUiState;
})();
