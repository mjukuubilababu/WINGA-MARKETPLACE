defmodule WingaConversations.Socket do
  use Phoenix.Socket
  channel("device", WingaConversations.DeviceChannel, log_join: false, log_handle_in: false)

  # Tickets travel in the join frame, never the upgrade URL or access logs.
  def connect(params, socket, _connect_info) do
    if Map.keys(params) -- ["vsn"] == [], do: {:ok, socket}, else: :error
  end

  def id(_socket), do: nil
end
