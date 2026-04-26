(() => {
  function createChatUiState() {
    return {
      openEmojiScope: "",
      activeContext: null,
      profileMessagesMode: "list",
      profileMessagesFilter: "all",
      profileHasSelection: false,
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
