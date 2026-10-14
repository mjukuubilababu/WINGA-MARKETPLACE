defmodule WingaConversations.ActivitySupervisor do
  use Supervisor
  def start_link(_), do: Supervisor.start_link(__MODULE__, [], name: __MODULE__)

  def init(_) do
    Supervisor.init(
      [
        WingaConversations.ActivityPresence,
        WingaConversations.ActivityRegistry,
        {Task.Supervisor, name: WingaConversations.ActivityTasks, max_children: 16}
      ],
      strategy: :one_for_all
    )
  end
end

defmodule WingaConversations.ActivityPresence do
  use Phoenix.Presence, otp_app: :winga_conversations, pubsub_server: WingaConversations.PubSub
end
