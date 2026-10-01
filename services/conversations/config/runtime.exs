import Config

if config_env() != :test do
  backend = System.get_env("CONVERSATION_BACKEND_URL", "http://127.0.0.1:3000")
  uri = URI.parse(backend)

  unless (uri.scheme == "https" and is_binary(uri.host) and uri.host != "") or
           (uri.scheme == "http" and uri.host in ["127.0.0.1", "localhost"]) do
    raise "CONVERSATION_BACKEND_URL must use HTTPS or explicit localhost HTTP"
  end

  if uri.userinfo || uri.query || uri.fragment || uri.path not in [nil, "", "/"] do
    raise "CONVERSATION_BACKEND_URL must be an origin without credentials"
  end

  service_token = System.fetch_env!("CONVERSATION_SERVICE_TOKEN")

  if byte_size(service_token) < 32,
    do: raise("CONVERSATION_SERVICE_TOKEN must be at least 32 bytes")

  config :winga_conversations,
    backend_url: String.trim_trailing(backend, "/"),
    service_token: service_token

  config :winga_conversations, WingaConversations.Endpoint,
    server: System.get_env("PHX_SERVER") == "true",
    http: [ip: {127, 0, 0, 1}, port: String.to_integer(System.get_env("PORT", "4100"))]
end

if config_env() == :prod do
  origins =
    System.fetch_env!("CONVERSATION_ALLOWED_ORIGINS")
    |> String.split(",", trim: true)
    |> Enum.map(&String.trim/1)

  valid_origin = fn origin ->
    parsed = URI.parse(origin)

    parsed.scheme == "https" and is_binary(parsed.host) and parsed.host != "" and
      not String.contains?(parsed.host, "*") and is_nil(parsed.userinfo) and
      is_nil(parsed.query) and is_nil(parsed.fragment) and parsed.path in [nil, "", "/"]
  end

  unless origins != [] and Enum.all?(origins, valid_origin) do
    raise "Explicit HTTPS origins are required"
  end

  secret = System.fetch_env!("SECRET_KEY_BASE")
  if byte_size(secret) < 64, do: raise("SECRET_KEY_BASE must be at least 64 bytes")

  config :winga_conversations, WingaConversations.Endpoint,
    secret_key_base: secret,
    check_origin: origins,
    http: [ip: {0, 0, 0, 0}, port: String.to_integer(System.get_env("PORT", "4100"))]
end
