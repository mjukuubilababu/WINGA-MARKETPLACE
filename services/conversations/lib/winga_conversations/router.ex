defmodule WingaConversations.Router do
  use Plug.Router
  plug(:match)
  plug(:dispatch)

  get "/health" do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(200, Jason.encode!(%{ok: true, service: "conversations-transport", version: 1}))
  end

  get "/ops/health" do
    secret = Application.get_env(:winga_conversations, :service_token, "")
    authorized = case get_req_header(conn, "authorization") do
      ["Bearer " <> token] when byte_size(token) <= 4096 ->
        byte_size(secret) >= 32 and Plug.Crypto.secure_compare(token, secret)
      _ -> false
    end
    conn = put_resp_header(conn, "cache-control", "no-store")
    if authorized do
      conn |> put_resp_content_type("application/json")
      |> send_resp(200, Jason.encode!(WingaConversations.Metrics.snapshot()))
    else
      send_resp(conn, 401, "")
    end
  end

  match _ do
    send_resp(conn, 404, "")
  end
end
