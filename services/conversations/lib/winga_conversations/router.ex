defmodule WingaConversations.Router do
  use Plug.Router
  plug(:match)
  plug(:dispatch)

  get "/health" do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(200, Jason.encode!(%{ok: true, service: "conversations-transport", version: 1}))
  end

  match _ do
    send_resp(conn, 404, "")
  end
end
