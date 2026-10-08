defmodule WingaConversations.Metrics do
  use GenServer
  @events [:send_accepted, :send_unknown, :poll_success, :poll_failed, :ack_success, :ack_failed, :protocol_error,
    :native_confirmed, :native_unknown]
  @table __MODULE__

  def start_link(_), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  def track(pid), do: GenServer.cast(__MODULE__, {:track, pid})
  def record(event, duration \\ 0)
  def record(event, duration) when event in @events and is_number(duration) and duration >= 0 do
    try do
      :ets.update_counter(@table, event, [{2, 1}, {3, min(round(duration), 300_000)}])
    rescue
      ArgumentError -> :ok
    end
    :ok
  end
  def record(_, _), do: :ok
  def snapshot, do: GenServer.call(__MODULE__, :snapshot, 2_000)

  @impl true
  def init(_) do
    previous_run = :persistent_term.get({__MODULE__, :started}, false)
    :persistent_term.put({__MODULE__, :started}, true)
    :ets.new(@table, [:named_table, :public, :set, write_concurrency: true])
    for event <- @events, do: :ets.insert(@table, {event, 0, 0})
    :erlang.system_flag(:scheduler_wall_time, true)
    Process.send_after(self(), :sample, 5_000)
    {:ok, %{connections: %{}, overflow: previous_run, baseline: scheduler_sample(), utilization: nil,
      started: System.system_time(:millisecond)}}
  end

  @impl true
  def handle_cast({:track, pid}, state) do
    cond do
      Map.has_key?(state.connections, pid) -> {:noreply, state}
      map_size(state.connections) >= 10_000 -> {:noreply, %{state | overflow: true}}
      true -> {:noreply, %{state | connections: Map.put(state.connections, pid, Process.monitor(pid))}}
    end
  end

  @impl true
  def handle_info({:DOWN, _, :process, pid, _}, state),
    do: {:noreply, %{state | connections: Map.delete(state.connections, pid)}}
  def handle_info(:sample, state) do
    sample = scheduler_sample()
    Process.send_after(self(), :sample, 5_000)
    {:noreply, %{state | baseline: sample, utilization: utilization(state.baseline, sample)}}
  end

  @impl true
  def handle_call(:snapshot, _, state) do
    queues = Enum.map(Map.keys(state.connections), fn pid ->
      case Process.info(pid, :message_queue_len) do
        {:message_queue_len, value} -> value
        _ -> 0
      end
    end)
    counters = for event <- @events do
      [{_, count, total}] = :ets.lookup(@table, event)
      %{event: event, count: count, averageDurationMs: if(count > 0, do: total / count, else: nil)}
    end
    result = %{ok: true, privacy: "aggregate-only", scope: "phoenix-node-since-start",
      securityMode: "legacy-plaintext-transport", startedAt: state.started,
      securityModeScope: "legacy-message-command-only",
      supportedOperationModes: ["legacy-message", "signed-native-operation"],
      connections: if(state.overflow, do: nil, else: map_size(state.connections)),
      connectionGaugeComplete: not state.overflow, queuedMessages: Enum.sum(queues),
      beamMemoryBytes: :erlang.memory(:total), schedulerUtilization: state.utilization,
      counters: counters, reconnectRate: nil, resumeSuccessRate: nil,
      duplicateSuppression: nil}
    {:reply, result, state}
  end

  defp scheduler_sample do
    count = :erlang.system_info(:schedulers)
    Map.new(for {id, active, total} <- :erlang.statistics(:scheduler_wall_time), id <= count,
      do: {id, {active, total}})
  end
  defp utilization(before, after_sample) do
    {active, total} = Enum.reduce(after_sample, {0, 0}, fn {id, {a, t}}, {aa, tt} ->
      case before[id] do
        {old_a, old_t} when t > old_t and a >= old_a -> {aa + a - old_a, tt + t - old_t}
        _ -> {aa, tt}
      end
    end)
    if total > 0, do: active / total, else: nil
  end
end
