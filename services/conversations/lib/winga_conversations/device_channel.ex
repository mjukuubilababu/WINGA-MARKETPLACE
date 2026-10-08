defmodule WingaConversations.DeviceChannel do
  use Phoenix.Channel
  @max_queue 64

  def join("device", %{"ticket" => ticket} = payload, socket)
      when is_binary(ticket) and byte_size(ticket) <= 2048 and map_size(payload) == 1 do
    now = System.system_time(:millisecond)

    case adapter().request(ticket, "authorize", %{}) do
      {:ok, %{"deviceId" => device, "expiresAt" => expires} = principal}
      when is_binary(device) and byte_size(device) > 0 and is_integer(expires) and expires > now ->
        Process.flag(:max_heap_size, %{size: 2_000_000, kill: true, error_logger: false})
        WingaConversations.Metrics.track(self())
        send(self(), :poll)
        Process.send_after(self(), :reauthorize, interval(:reauthorize_interval))

        {:ok, principal,
         assign(socket,
           ticket: ticket,
           device: device,
           expires: expires,
           pending: MapSet.new(),
           window: System.monotonic_time(:millisecond),
           count: 0
         )}

      _ ->
        {:error, %{code: "unauthorized"}}
    end
  end

  def join(_, _, _), do: {:error, %{code: "unauthorized"}}

  def handle_in(event, payload, socket) do
    {:message_queue_len, queued} = Process.info(self(), :message_queue_len)
    now = System.monotonic_time(:millisecond)

    socket =
      if now - socket.assigns.window >= 10_000,
        do: assign(socket, window: now, count: 0),
        else: socket

    cond do
      queued > @max_queue or socket.assigns.count >= 20 ->
        {:stop, :normal, socket}

      System.system_time(:millisecond) >= socket.assigns.expires ->
        {:stop, :normal, socket}

      not is_map(payload) or byte_size(Jason.encode!(payload)) > 24_000 ->
        WingaConversations.Metrics.record(:protocol_error)
        {:reply, {:error, %{code: "invalid_request"}}, socket}

      true ->
        dispatch(event, payload, assign(socket, :count, socket.assigns.count + 1))
    end
  end

  defp dispatch("message.send", payload, socket) do
    case measured_request(socket.assigns.ticket, "send", payload) do
      {:ok, %{"id" => id, "conversationSequence" => sequence} = message}
      when is_binary(id) and is_binary(sequence) ->
        {:reply, {:ok, %{accepted: true, message: message}}, socket}

      {:error, :unauthorized} ->
        {:stop, :normal, socket}

      {:error, :rejected} ->
        {:reply, {:error, %{code: "rejected"}}, socket}

      _ ->
        {:reply, {:error, %{code: "outcome_unknown", retrySameClientMessageId: true}}, socket}
    end
  end

  defp dispatch("events.ack", %{"eventIds" => ids} = payload, socket)
       when is_list(ids) and length(ids) in 1..50 and map_size(payload) == 1 do
    result =
      measured_request(socket.assigns.ticket, "ack", %{
        "eventIds" => ids,
        "deviceId" => socket.assigns.device
      })

    case result do
      {:ok, reply} ->
        pending = MapSet.difference(socket.assigns.pending, MapSet.new(ids))

        if MapSet.size(socket.assigns.pending) > 0 and MapSet.size(pending) == 0,
          do: send(self(), :poll)

        {:reply, {:ok, reply}, assign(socket, :pending, pending)}

      {:error, :unauthorized} ->
        {:stop, :normal, socket}

      _ ->
        {:reply, {:error, %{code: "ack_unconfirmed"}}, socket}
    end
  end

  defp dispatch("message.receipt", payload, socket) do
    case adapter().request(
           socket.assigns.ticket,
           "receipt",
           Map.put(payload, "deviceId", socket.assigns.device)
         ) do
      {:ok, reply} -> {:reply, {:ok, reply}, socket}
      {:error, :unauthorized} -> {:stop, :normal, socket}
      _ -> {:reply, {:error, %{code: "receipt_unconfirmed"}}, socket}
    end
  end

  defp dispatch(_, _, socket) do
    WingaConversations.Metrics.record(:protocol_error)
    {:reply, {:error, %{code: "invalid_request"}}, socket}
  end

  def handle_info(:poll, socket) do
    if MapSet.size(socket.assigns.pending) > 0 do
      {:noreply, socket}
    else
      case measured_request(socket.assigns.ticket, "poll", %{}, socket.assigns.device) do
        {:ok, %{"events" => events, "deviceId" => device} = batch}
        when is_list(events) and length(events) <= 50 and device == socket.assigns.device ->
          if events == [] do
            Process.send_after(self(), :poll, interval(:poll_interval))
            {:noreply, socket}
          else
            push(socket, "events", batch)
            {:noreply, assign(socket, :pending, MapSet.new(events, & &1["id"]))}
          end

        {:error, :unauthorized} ->
          {:stop, :normal, socket}

        _ ->
          Process.send_after(self(), :poll, interval(:poll_interval))
          {:noreply, socket}
      end
    end
  end

  def handle_info(:reauthorize, socket) do
    now = System.system_time(:millisecond)

    case adapter().request(socket.assigns.ticket, "authorize", %{}) do
      {:ok, %{"deviceId" => device, "expiresAt" => expires}}
      when device == socket.assigns.device and is_integer(expires) and expires > now ->
        Process.send_after(self(), :reauthorize, interval(:reauthorize_interval))
        {:noreply, socket}

      _ ->
        {:stop, :normal, socket}
    end
  end

  defp adapter, do: Application.fetch_env!(:winga_conversations, :adapter)
  defp measured_request(ticket, command, payload, expected_device \\ nil) do
    started = System.monotonic_time(:millisecond)
    result = adapter().request(ticket, command, payload)
    event = case {command, result} do
      {"send", {:ok, %{"id" => id, "conversationSequence" => sequence}}} when is_binary(id) and is_binary(sequence) -> :send_accepted
      {"send", _} -> :send_unknown
      {"poll", {:ok, %{"events" => events, "deviceId" => device}}}
      when is_list(events) and length(events) <= 50 and device == expected_device -> :poll_success
      {"poll", _} -> :poll_failed
      {"ack", {:ok, _}} -> :ack_success
      {"ack", _} -> :ack_failed
    end
    WingaConversations.Metrics.record(event, System.monotonic_time(:millisecond) - started)
    result
  end
  defp interval(key), do: Application.fetch_env!(:winga_conversations, key)
end
