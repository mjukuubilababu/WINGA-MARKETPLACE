defmodule WingaConversations.ActivityRegistry do
  use GenServer
  alias WingaConversations.ActivityPresence, as: Presence
  @ttl 12_000
  @typing_ttl 6_000
  @max_entries 2_048
  @max_requests 8_192
  def start_link(_), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  def topic(scope),
    do:
      "activity:" <>
        Base.encode16(
          :crypto.hash(:sha256, Jason.encode!([scope["conversationId"], scope["epoch"]])),
          case: :lower
        )

  def signal_topic(value) when is_binary(value), do: "signal:" <> value
  def signal_topic(scope), do: signal_topic(topic(scope))
  def put(pid, scope), do: safe_call({:put, pid, scope})
  def snapshot(scope), do: safe_call({:snapshot, scope})
  def drop(pid), do: GenServer.cast(__MODULE__, {:drop, pid})

  defp safe_call(value) do
    GenServer.call(__MODULE__, value, 200)
  catch
    :exit, _ -> {:error, :unavailable}
  end

  def init(_) do
    Process.send_after(self(), :sweep, 1_000)
    {:ok, %{entries: %{}, requests: %{}}}
  end

  def handle_call({:put, pid, scope}, _, state) do
    now = System.monotonic_time(:millisecond)
    target = topic(scope)
    key = {pid, target}
    request = {target, scope["actorId"], scope["requestId"]}
    entries = Enum.filter(state.entries, fn {{owner_pid, _}, _} -> owner_pid == pid end)

    connections =
      Enum.count(state.entries, fn {{_, t}, e} -> t == target and e.actor == scope["actorId"] end)

    cond do
      Map.has_key?(state.requests, request) ->
        {:reply, {:ok, view(scope)}, state}

      map_size(state.requests) >= @max_requests ->
        {:reply, {:error, :busy}, state}

      not Map.has_key?(state.entries, key) and
          (map_size(state.entries) >= @max_entries or length(entries) >= 2 or connections >= 4) ->
        {:reply, {:error, :busy}, state}

      true ->
        state = %{state | requests: Map.put(state.requests, request, now + 65_000)}
        state = remove(state, key)

        if scope["allowed"] and scope["online"] do
          meta = %{
            actor: scope["actorId"],
            expires: System.system_time(:millisecond) + @ttl,
            typing_until:
              System.system_time(:millisecond) + if(scope["typing"], do: @typing_ttl, else: 0)
          }

          case Presence.track(pid, target, scope["owner"], meta) do
            {:ok, _} ->
              ref = Process.monitor(pid)

              entry = %{
                actor: scope["actorId"],
                owner: scope["owner"],
                expires: now + @ttl,
                ref: ref
              }

              state = %{state | entries: Map.put(state.entries, key, entry)}
              changed(target)
              {:reply, {:ok, view(scope)}, state}

            _ ->
              {:reply, {:error, :unavailable}, state}
          end
        else
          changed(target)
          {:reply, {:ok, view(scope)}, state}
        end
    end
  end

  def handle_call({:snapshot, scope}, _, state), do: {:reply, {:ok, view(scope)}, state}

  def handle_cast({:drop, pid}, state) do
    next =
      Enum.reduce(Map.keys(state.entries), state, fn {owner, _} = key, acc ->
        if owner == pid, do: remove(acc, key), else: acc
      end)

    {:noreply, next}
  end

  def handle_info(:sweep, state) do
    now = System.monotonic_time(:millisecond)

    next =
      Enum.reduce(state.entries, state, fn {key, e}, acc ->
        if e.expires <= now, do: remove(acc, key), else: acc
      end)

    requests = Map.reject(next.requests, fn {_, expires} -> expires <= now end)
    Process.send_after(self(), :sweep, 1_000)
    {:noreply, %{next | requests: requests}}
  end

  def handle_info({:DOWN, ref, :process, _, _}, state) do
    {:noreply,
     Enum.reduce(state.entries, state, fn {key, e}, acc ->
       if e.ref == ref, do: remove(acc, key), else: acc
     end)}
  end

  defp remove(state, {pid, target} = key) do
    case Map.pop(state.entries, key) do
      {nil, _} ->
        state

      {entry, entries} ->
        Process.demonitor(entry.ref, [:flush])
        Presence.untrack(pid, target, entry.owner)
        changed(target)
        %{state | entries: entries}
    end
  end

  defp changed(target),
    do:
      Phoenix.PubSub.broadcast(
        WingaConversations.PubSub,
        signal_topic(target),
        {:activity_changed, signal_topic(target)}
      )

  defp view(scope) do
    now = System.system_time(:millisecond)

    states =
      if scope["allowed"] do
        Presence.list(topic(scope))
        |> Enum.filter(fn {owner, _} ->
          owner != scope["owner"] and owner in scope["audience"]
        end)
        |> Enum.flat_map(fn {owner, %{metas: metas}} ->
          active = Enum.filter(metas, &(&1.expires > now))

          if active == [],
            do: [],
            else: [
              %{
                owner: owner,
                online: true,
                typing: Enum.any?(active, &(&1.typing_until > now)),
                typingTtlMs:
                  max(0, min(@typing_ttl, Enum.max(Enum.map(active, &(&1.typing_until - now))))),
                ttlMs: min(@ttl, Enum.max(Enum.map(active, &(&1.expires - now))))
              }
            ]
        end)
        |> Enum.sort_by(& &1.owner)
      else
        []
      end

    %{
      version: 1,
      conversationId: scope["conversationId"],
      enabled: scope["allowed"] == true,
      states: states
    }
  end
end
