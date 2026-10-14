defmodule WingaConversations.Application do
  use Application

  def start(_type, _args) do
    children = [
      {Phoenix.PubSub, name: WingaConversations.PubSub},
      WingaConversations.ActivitySupervisor,
      {Finch, name: WingaConversations.ActivityHTTP, pools: %{default: [size: 2, count: 1]}},
      {Finch, name: WingaConversations.HTTP, pools: %{default: [size: 16, count: 1]}},
      WingaConversations.Metrics,
      WingaConversations.Endpoint
    ]

    Supervisor.start_link(children, strategy: :one_for_one, name: WingaConversations.Supervisor)
  end

  def config_change(changed, _new, removed) do
    WingaConversations.Endpoint.config_change(changed, removed)
    :ok
  end
end
