import Config

config :winga_conversations,
  adapter: WingaConversations.Adapter,
  poll_interval: 2_000,
  reauthorize_interval: 10_000

config :winga_conversations, WingaConversations.Endpoint,
  adapter: Bandit.PhoenixAdapter,
  url: [host: "localhost"],
  http: [ip: {127, 0, 0, 1}, port: 4100],
  server: false,
  secret_key_base: String.duplicate("local-development-only-", 4),
  check_origin: ["http://localhost:4173", "http://127.0.0.1:4173"],
  pubsub_server: WingaConversations.PubSub

config :phoenix, :json_library, Jason
config :phoenix, :filter_parameters, ["ticket", "token", "message", "authorization"]
config :logger, level: :warning

if config_env() == :test do
  config :winga_conversations,
    adapter: WingaConversations.TestAdapter,
    poll_interval: 60_000,
    reauthorize_interval: 60_000
end
