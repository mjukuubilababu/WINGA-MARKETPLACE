defmodule WingaConversations.DelayedActivityAdapter do
  def request(ticket, "activity", payload) do
    result = WingaConversations.TestAdapter.request(ticket, "activity", payload)

    case result do
      {:delay, owner} ->
        send(owner, {:activity_waiting, self()})

        receive do
          :release -> {:error, :unavailable}
        after
          2_000 -> {:error, :unavailable}
        end

      _ ->
        result
    end
  end

  def request(ticket, command, payload),
    do: WingaConversations.TestAdapter.request(ticket, command, payload)
end

defmodule WingaConversations.ActivityTest do
  use ExUnit.Case, async: false
  import Phoenix.ChannelTest
  @endpoint WingaConversations.Endpoint
  alias WingaConversations.{Socket, TestAdapter, ActivityRegistry}
  @cid "12345678-1234-4234-8234-123456789abc"
  @actor "22345678-1234-4234-8234-123456789abc"
  setup do
    owner = self()

    start_supervised!(%{
      id: TestAdapter,
      start:
        {Agent, :start_link, [fn -> %{owner: owner, responses: %{}} end, [name: TestAdapter]]}
    })

    Application.put_env(:winga_conversations, :adapter, WingaConversations.DelayedActivityAdapter)
    on_exit(fn -> Application.put_env(:winga_conversations, :adapter, TestAdapter) end)
    :ok
  end

  defp reply(command, result),
    do: Agent.update(TestAdapter, &put_in(&1, [:responses, command], result))

  defp join(enabled \\ true) do
    reply(
      "authorize",
      {:ok,
       %{
         "deviceId" => "device-a",
         "expiresAt" => System.system_time(:millisecond) + 300_000,
         "nativeOperations" => true,
         "activityEnabled" => enabled
       }}
    )

    {:ok, socket} = connect(Socket, %{})
    {:ok, _, socket} = subscribe_and_join(socket, "device", %{"ticket" => "valid"})
    socket
  end

  defp operation(id \\ "request-a"),
    do: %{
      "action" => "activity",
      "actorId" => @actor,
      "requestId" => id,
      "payload" => %{"conversationId" => @cid, "online" => true, "typing" => true}
    }

  defp scope(owner \\ "alice", actor \\ @actor),
    do: %{
      "version" => 1,
      "conversationId" => @cid,
      "epoch" => "1",
      "owner" => owner,
      "actorId" => actor,
      "allowed" => true,
      "audience" => ["alice", "bob"],
      "online" => true,
      "typing" => true,
      "requestId" => "synthetic-" <> owner
    }

  test "activity is negotiated separately; disabling it does not disable durable messaging" do
    socket = join(false)
    ref = push(socket, "activity", operation())
    assert_reply(ref, :error, %{code: "activity_unavailable"})

    ref =
      push(socket, "message.send", %{
        "clientMessageId" => "synthetic",
        "receiverId" => "bob",
        "message" => "synthetic"
      })

    assert_reply(ref, :ok, %{accepted: true})
  end

  test "activity auth failure and mismatched destination never publish presence" do
    socket = join()
    reply("activity", {:ok, Map.put(scope(), "conversationId", "wrong")})
    ref = push(socket, "activity", operation())
    assert_reply(ref, :error, %{code: "activity_unavailable"})
    reply("activity", {:error, :unauthorized})
    ref = push(socket, "activity", operation("retry"))
    assert_reply(ref, :error, %{code: "activity_unavailable"})

    ref =
      push(socket, "message.send", %{
        "clientMessageId" => "still-works",
        "receiverId" => "bob",
        "message" => "synthetic"
      })

    assert_reply(ref, :ok, %{accepted: true})
  end

  test "slow activity authorization is asynchronous and cannot hold up durable ACKs" do
    socket = join()
    reply("activity", {:delay, self()})
    ref = push(socket, "activity", operation())
    assert_receive {:activity_waiting, task}

    message =
      push(socket, "message.send", %{
        "clientMessageId" => "priority",
        "receiverId" => "bob",
        "message" => "synthetic"
      })

    assert_reply(message, :ok, %{accepted: true})
    send(task, :release)
    assert_reply(ref, :error, %{code: "activity_unavailable"})
  end

  test "activity flood uses a separate bounded budget and preserves core message capacity" do
    socket = join()
    reply("activity", {:ok, scope()})

    for n <- 1..6 do
      ref = push(socket, "activity", operation("budget-#{n}"))
      assert_reply(ref, :ok, %{version: 1})
    end

    ref = push(socket, "activity", operation("over-budget"))
    assert_reply(ref, :error, %{code: "activity_busy"})

    ref =
      push(socket, "message.send", %{
        "clientMessageId" => "core-capacity",
        "receiverId" => "bob",
        "message" => "synthetic"
      })

    assert_reply(ref, :ok, %{accepted: true})
  end

  test "presence aggregates authorized devices without disclosing device identity or unrelated users" do
    endpoint =
      spawn(fn ->
        receive do
          :stop -> :ok
        end
      end)

    on_exit(fn -> send(endpoint, :stop) end)
    assert {:ok, _} = ActivityRegistry.put(endpoint, scope("bob", "native-bob"))
    Process.sleep(100)
    assert {:ok, %{states: [state]}} = ActivityRegistry.snapshot(scope())
    assert state.owner == "bob" and state.online and state.typing
    assert state.ttlMs > 0 and state.ttlMs <= 12_000
    assert Enum.sort(Map.keys(state)) == [:online, :owner, :ttlMs, :typing, :typingTtlMs]

    assert {:ok, %{states: []}} =
             ActivityRegistry.snapshot(Map.put(scope(), "audience", ["alice"]))

    assert {:ok, %{states: []}} = ActivityRegistry.snapshot(Map.put(scope(), "epoch", "2"))
    ActivityRegistry.drop(endpoint)
    assert {:ok, %{states: []}} = ActivityRegistry.snapshot(scope())
  end
end
