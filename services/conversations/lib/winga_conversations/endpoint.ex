defmodule WingaConversations.Endpoint do
  use Phoenix.Endpoint, otp_app: :winga_conversations

  socket("/socket", WingaConversations.Socket,
    websocket: [max_frame_size: 32_768, timeout: 30_000],
    longpoll: false
  )

  plug(WingaConversations.Router)
end
