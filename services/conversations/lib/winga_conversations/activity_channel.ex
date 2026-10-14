defmodule WingaConversations.ActivityChannel do
  import Phoenix.Socket, only: [assign: 3]
  alias WingaConversations.ActivityRegistry, as: Registry

  def request(payload, socket, reply_ref) do
    cond do
      socket.assigns[:activity_task] ->
        {:reply, {:error, %{code: "activity_busy"}}, socket}

      not socket.assigns[:activity_enabled] or not is_map(payload) or
          byte_size(Jason.encode!(payload)) > 4_096 ->
        {:reply, {:error, %{code: "activity_unavailable"}}, socket}

      true ->
        start(payload, socket, reply_ref, true)
    end
  end

  defp start(payload, socket, reply_ref, publish) do
    channel = self()
    id = make_ref()
    adapter = Application.fetch_env!(:winga_conversations, :adapter)
    ticket = socket.assigns.ticket

    task =
      Task.Supervisor.start_child(WingaConversations.ActivityTasks, fn ->
        result =
          try do
            adapter.request(ticket, "activity", payload)
          rescue
            _ -> {:error, :unavailable}
          end

        send(channel, {:activity_result, id, result})
      end)

    case task do
      {:ok, pid} ->
        timer = Process.send_after(self(), {:activity_timeout, id}, 1_600)

        {:noreply,
         assign(socket, :activity_task, %{
           id: id,
           pid: pid,
           timer: timer,
           payload: payload,
           reply: reply_ref,
           publish: publish
         })}

      _ ->
        {:reply, {:error, %{code: "activity_busy"}}, socket}
    end
  catch
    :exit, _ -> {:reply, {:error, %{code: "activity_unavailable"}}, socket}
  end

  def result(id, result, socket) do
    task = socket.assigns[:activity_task]

    if task && task.id == id do
      Process.cancel_timer(task.timer)
      socket = assign(socket, :activity_task, nil)

      case result do
        {:ok,
         %{
           "version" => 1,
           "conversationId" => cid,
           "epoch" => epoch,
           "owner" => owner,
           "actorId" => actor,
           "allowed" => allowed,
           "audience" => audience,
           "online" => online,
           "typing" => typing
         } = scope}
        when is_binary(cid) and is_binary(epoch) and is_binary(owner) and is_binary(actor) and
               is_boolean(allowed) and
               is_list(audience) and length(audience) <= 12 and is_boolean(online) and
               is_boolean(typing) ->
          if socket.assigns[:activity_enabled] && bound?(scope, task.payload) do
            scope = Map.merge(scope, %{"requestId" => task.payload["requestId"]})

            response =
              if task.publish, do: Registry.put(self(), scope), else: Registry.snapshot(scope)

            target = Registry.signal_topic(scope)
            old = socket.assigns[:activity_scope]

            if old && old.topic != target,
              do: Phoenix.PubSub.unsubscribe(WingaConversations.PubSub, old.topic)

            if is_nil(old) || old.topic != target,
              do: Phoenix.PubSub.subscribe(WingaConversations.PubSub, target)

            socket = assign(socket, :activity_scope, %{topic: target, payload: task.payload})
            deliver(task, response, socket)
            {:noreply, socket}
          else
            Registry.drop(self())
            deliver(task, {:error, :unavailable}, socket)
            {:noreply, clear_scope(socket)}
          end

        _ ->
          Registry.drop(self())
          deliver(task, {:error, :unavailable}, socket)
          {:noreply, clear_scope(socket)}
      end
    else
      {:noreply, socket}
    end
  end

  def timeout(id, socket) do
    task = socket.assigns[:activity_task]

    if task && task.id == id do
      Process.exit(task.pid, :kill)
      Registry.drop(self())
      deliver(task, {:error, :unavailable}, socket)
      {:noreply, clear_scope(assign(socket, :activity_task, nil))}
    else
      {:noreply, socket}
    end
  end

  def changed(target, socket) do
    scope = socket.assigns[:activity_scope]

    if scope && scope.topic == target && is_nil(socket.assigns[:activity_refresh]) do
      timer = Process.send_after(self(), :activity_refresh, 2_000)
      {:noreply, assign(socket, :activity_refresh, timer)}
    else
      {:noreply, socket}
    end
  end

  def refresh(socket) do
    socket = assign(socket, :activity_refresh, nil)
    scope = socket.assigns[:activity_scope]
    {:message_queue_len, queued} = Process.info(self(), :message_queue_len)

    if scope && socket.assigns[:activity_enabled] && is_nil(socket.assigns[:activity_task]) &&
         queued < 16 && MapSet.size(socket.assigns.pending) == 0 do
      case start(scope.payload, socket, nil, false) do
        {:noreply, next} -> {:noreply, next}
        _ -> {:noreply, socket}
      end
    else
      {:noreply, socket}
    end
  end

  defp bound?(scope, payload) do
    p = payload["payload"] || %{}

    scope["conversationId"] == p["conversationId"] && scope["actorId"] == payload["actorId"] &&
      scope["online"] == p["online"] && scope["typing"] == p["typing"] &&
      Regex.match?(~r/^(0|[1-9][0-9]{0,18})$/, scope["epoch"]) &&
      Enum.all?(
        [scope["owner"] | scope["audience"]],
        &(is_binary(&1) && Regex.match?(~r/^[A-Za-z0-9._:-]{1,128}$/, &1))
      ) &&
      (not scope["allowed"] || scope["owner"] in scope["audience"])
  end

  defp clear_scope(socket) do
    if scope = socket.assigns[:activity_scope],
      do: Phoenix.PubSub.unsubscribe(WingaConversations.PubSub, scope.topic)

    assign(socket, :activity_scope, nil)
  end

  defp deliver(%{reply: nil}, {:ok, value}, socket),
    do: Phoenix.Channel.push(socket, "activity", value)

  defp deliver(%{reply: nil}, _, _), do: :ok
  defp deliver(task, {:ok, value}, _), do: Phoenix.Channel.reply(task.reply, {:ok, value})

  defp deliver(task, _, _),
    do: Phoenix.Channel.reply(task.reply, {:error, %{code: "activity_unavailable"}})
end
