defmodule WingaConversations.TestAdapter do
  def request(ticket, command, payload) do
    Agent.get(__MODULE__, fn state ->
      send(state.owner, {:adapter, command, payload})

      if ticket != "valid" do
        {:error, :unauthorized}
      else
        Map.get_lazy(state.responses, command, fn -> default(command) end)
      end
    end)
  end

  defp default("authorize"),
    do:
      {:ok,
       %{"deviceId" => "device-a", "expiresAt" => System.system_time(:millisecond) + 300_000}}

  defp default("poll"), do: {:ok, %{"deviceId" => "device-a", "events" => [], "items" => []}}
  defp default("ack"), do: {:ok, %{"ok" => true, "acknowledged" => 1}}
  defp default("receipt"), do: {:ok, %{"ok" => true}}
  defp default("send"), do: {:ok, %{"id" => "canonical", "conversationSequence" => "1"}}
  defp default("native"), do: {:error, :unavailable}
end
