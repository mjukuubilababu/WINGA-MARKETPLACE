(() => {
  function createAdminDataTools() {
    function summarizeAdminMessageThreads(messages = [], users = [], reports = []) {
      const userMap = new Map((Array.isArray(users) ? users : []).map((user) => {
        const username = String(user?.username || "").trim();
        return [username, user];
      }));
      const threadMap = new Map();
      (Array.isArray(messages) ? messages : []).forEach((message) => {
        const conversationId = String(message?.conversationId || "").trim() || [message?.senderId, message?.receiverId].filter(Boolean).sort().join("::") + `::${message?.productId || ""}`;
        const existing = threadMap.get(conversationId) || {
          conversationId,
          senderId: String(message?.senderId || "").trim(),
          receiverId: String(message?.receiverId || "").trim(),
          senderName: userMap.get(String(message?.senderId || "").trim())?.fullName || String(message?.senderId || "").trim(),
          receiverName: userMap.get(String(message?.receiverId || "").trim())?.fullName || String(message?.receiverId || "").trim(),
          productId: String(message?.productId || "").trim(),
          productName: String(message?.productName || "").trim(),
          messageType: String(message?.messageType || "text").trim(),
          messageCount: 0,
          unreadCount: 0,
          lastMessageAt: "",
          lastMessagePreview: "",
          reportCount: 0
        };
        existing.messageCount += 1;
        if (!message?.isRead) {
          existing.unreadCount += 1;
        }
        const nextTime = new Date(message?.timestamp || message?.createdAt || 0).getTime();
        const currentTime = new Date(existing.lastMessageAt || 0).getTime();
        if (!existing.lastMessageAt || nextTime >= currentTime) {
          existing.lastMessageAt = String(message?.timestamp || message?.createdAt || "");
          existing.lastMessagePreview = String(message?.message || "").trim().slice(0, 160);
          existing.messageType = String(message?.messageType || "text").trim() || existing.messageType;
          existing.productId = String(message?.productId || existing.productId || "").trim();
          existing.productName = String(message?.productName || existing.productName || "").trim();
          existing.senderId = String(message?.senderId || existing.senderId || "").trim();
          existing.receiverId = String(message?.receiverId || existing.receiverId || "").trim();
          existing.senderName = userMap.get(existing.senderId)?.fullName || existing.senderId;
          existing.receiverName = userMap.get(existing.receiverId)?.fullName || existing.receiverId;
        }
        threadMap.set(conversationId, existing);
      });

      const reportList = Array.isArray(reports) ? reports : [];
      return Array.from(threadMap.values())
        .map((thread) => {
          const relatedReports = reportList.filter((report) =>
            String(report?.targetUserId || "") === thread.senderId
            || String(report?.targetUserId || "") === thread.receiverId
            || String(report?.targetProductId || "") === thread.productId
            || /message|chat|conversation|abuse|fraud/i.test(`${report?.reason || ""} ${report?.description || ""}`)
          );
          return {
            ...thread,
            reportCount: relatedReports.length,
            hasReportedContent: relatedReports.length > 0
          };
        })
        .sort((first, second) => new Date(second.lastMessageAt || 0).getTime() - new Date(first.lastMessageAt || 0).getTime());
    }

    function buildAdminMessageReviewDetails(messages = [], users = [], reports = [], conversationId = "", reason = "", reviewer = "") {
      const normalizedConversationId = String(conversationId || "").trim();
      const normalizedMessages = (Array.isArray(messages) ? messages : [])
        .filter((message) => String(message?.conversationId || "").trim() === normalizedConversationId)
        .map((message) => ({
          ...message,
          senderId: String(message?.senderId || "").trim(),
          receiverId: String(message?.receiverId || "").trim(),
          productId: String(message?.productId || "").trim(),
          productName: String(message?.productName || "").trim(),
          messageType: String(message?.messageType || "text").trim(),
          message: String(message?.message || "").trim()
        }))
        .sort((first, second) => new Date(first.timestamp || first.createdAt || 0).getTime() - new Date(second.timestamp || second.createdAt || 0).getTime());

      if (!normalizedMessages.length) {
        return null;
      }

      const thread = summarizeAdminMessageThreads(normalizedMessages, users, reports).find((item) => item.conversationId === normalizedConversationId) || null;
      const lastMessage = normalizedMessages[normalizedMessages.length - 1];
      const userMap = new Map((Array.isArray(users) ? users : []).map((user) => [String(user?.username || "").trim(), user]));
      const sender = userMap.get(lastMessage.senderId) || null;
      const receiver = userMap.get(lastMessage.receiverId) || null;

      return {
        conversationId: normalizedConversationId,
        reason: String(reason || "").trim(),
        reviewedBy: String(reviewer || "").trim(),
        reviewedAt: new Date().toISOString(),
        participants: {
          sender: sender ? {
            username: sender.username || lastMessage.senderId,
            fullName: sender.fullName || sender.username || lastMessage.senderId,
            role: sender.role || ""
          } : {
            username: lastMessage.senderId,
            fullName: lastMessage.senderId,
            role: ""
          },
          receiver: receiver ? {
            username: receiver.username || lastMessage.receiverId,
            fullName: receiver.fullName || receiver.username || lastMessage.receiverId,
            role: receiver.role || ""
          } : {
            username: lastMessage.receiverId,
            fullName: lastMessage.receiverId,
            role: ""
          }
        },
        summary: thread || {
          conversationId: normalizedConversationId,
          senderId: lastMessage.senderId,
          receiverId: lastMessage.receiverId,
          productId: lastMessage.productId || "",
          productName: lastMessage.productName || "",
          messageType: lastMessage.messageType || "text",
          messageCount: normalizedMessages.length,
          unreadCount: normalizedMessages.filter((message) => !message.isRead).length,
          lastMessageAt: lastMessage.timestamp || lastMessage.createdAt || "",
          lastMessagePreview: String(lastMessage.message || "").trim().slice(0, 160),
          reportCount: 0,
          hasReportedContent: false
        },
        messages: normalizedMessages.map((message) => ({
          id: message.id,
          senderId: message.senderId,
          receiverId: message.receiverId,
          productId: message.productId || "",
          productName: message.productName || "",
          messageType: message.messageType || "text",
          message: message.message || "",
          timestamp: message.timestamp || "",
          createdAt: message.createdAt || "",
          updatedAt: message.updatedAt || "",
          deliveredAt: message.deliveredAt || "",
          readAt: message.readAt || "",
          isDelivered: Boolean(message.isDelivered),
          isRead: Boolean(message.isRead)
        }))
      };
    }

    return {
      summarizeAdminMessageThreads,
      buildAdminMessageReviewDetails
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.adminTools = window.WingaModules.api.adminTools || {};
  window.WingaModules.api.adminTools.createAdminDataTools = createAdminDataTools;
})();
