defmodule WingaConversations.DeviceChannelTest do
  use ExUnit.Case, async: false
  import Phoenix.ChannelTest
  @endpoint WingaConversations.Endpoint
  alias WingaConversations.{Socket, TestAdapter}

  setup do
    owner = self()

    start_supervised!(%{
      id: TestAdapter,
      start:
        {Agent, :start_link, [fn -> %{owner: owner, responses: %{}} end, [name: TestAdapter]]}
    })

    :ok
  end

  defp reply(command, value),
    do: Agent.update(TestAdapter, &put_in(&1, [:responses, command], value))

  defp join do
    {:ok, socket} = connect(Socket, %{})
    subscribe_and_join(socket, "device", %{"ticket" => "valid"})
  end

  test "credentials in the upgrade URL and unauthenticated joins are rejected" do
    assert :error = connect(Socket, %{"ticket" => "valid"})
    {:ok, socket} = connect(Socket, %{})

    assert {:error, %{code: "unauthorized"}} =
             subscribe_and_join(socket, "device", %{"ticket" => "invalid"})

    assert {:error, %{code: "unauthorized"}} = subscribe_and_join(socket, "device", %{})
  end

  test "accepted requires a canonical write response; uncertain sends preserve retry identity" do
    {:ok, _, socket} = join()

    payload = %{
      "clientMessageId" => "same-logical-id",
      "receiverId" => "bob",
      "message" => "synthetic"
    }

    ref = push(socket, "message.send", payload)
    assert_reply(ref, :ok, %{accepted: true, message: %{"id" => "canonical"}})
    reply("send", {:error, :unavailable})
    ref = push(socket, "message.send", payload)
    assert_reply(ref, :error, %{code: "outcome_unknown", retrySameClientMessageId: true})
    reply("send", {:ok, %{}})
    ref = push(socket, "message.send", payload)
    assert_reply(ref, :error, %{code: "outcome_unknown"})
  end

  test "one pending batch bounds delivery and only explicit ACK advances it" do
    reply(
      "poll",
      {:ok, %{"deviceId" => "device-a", "events" => [%{"id" => "event-1"}], "items" => []}}
    )

    {:ok, _, socket} = join()
    assert_push("events", %{"events" => [%{"id" => "event-1"}]})
    assert_receive {:adapter, "poll", %{}}
    send(socket.channel_pid, :poll)
    refute_receive {:adapter, "poll", _}, 50
    refute_receive {:adapter, "receipt", _}, 10
    reply("poll", {:ok, %{"deviceId" => "device-a", "events" => [], "items" => []}})
    ref = push(socket, "events.ack", %{"eventIds" => ["event-1"]})
    assert_reply(ref, :ok, %{"acknowledged" => 1})
    assert_receive {:adapter, "ack", %{"deviceId" => "device-a", "eventIds" => ["event-1"]}}
    assert_receive {:adapter, "poll", %{}}
  end

  test "receipts bind to the authenticated device and revocation closes idle channels" do
    {:ok, _, socket} = join()
    ref = push(socket, "message.receipt", %{"deviceId" => "forged", "kind" => "stored"})
    assert_reply(ref, :ok, _)
    assert_receive {:adapter, "receipt", %{"deviceId" => "device-a"}}
    monitor = Process.monitor(socket.channel_pid)
    reply("authorize", {:error, :unauthorized})
    send(socket.channel_pid, :reauthorize)
    assert_receive {:DOWN, ^monitor, :process, _, :normal}
  end

  test "backend authorization outages close an idle channel" do
    {:ok, _, socket} = join()
    monitor = Process.monitor(socket.channel_pid)
    reply("authorize", {:error, :unavailable})
    send(socket.channel_pid, :reauthorize)
    assert_receive {:DOWN, ^monitor, :process, _, :normal}
  end

  test "expired backend principals cannot join" do
    reply("authorize", {:ok, %{"deviceId" => "device-a", "expiresAt" => 1}})
    assert {:error, %{code: "unauthorized"}} = join()
  end

  test "payload and command budgets bound a connected client" do
    {:ok, _, socket} = join()
    ref = push(socket, "message.send", %{"message" => String.duplicate("x", 24_001)})
    assert_reply(ref, :error, %{code: "invalid_request"})

    for _ <- 1..20 do
      ref = push(socket, "unknown", %{})
      assert_reply(ref, :error, %{code: "invalid_request"})
    end

    monitor = Process.monitor(socket.channel_pid)
    push(socket, "unknown", %{})
    assert_receive {:DOWN, ^monitor, :process, _, :normal}
  end

  defp native_join do
    reply("authorize", {:ok, %{"deviceId" => "device-a",
      "expiresAt" => System.system_time(:millisecond) + 60_000, "nativeOperations" => true}})
    join()
  end

  # Opaque channel fixture only; real signatures and MLS are exercised by the browser/PG acceptance.
  defp opaque_operation do
    %{"action" => "poll", "actorId" => "native-actor", "requestId" => "native-request",
      "issuedAt" => System.system_time(:millisecond), "payload" => %{}, "signature" => "opaque"}
  end

  test "native support is negotiated independently of legacy join authentication" do
    {:ok, _, socket} = join()
    ref = push(socket, "encrypted.operation", opaque_operation())
    assert_reply(ref, :error, %{code: "native_unavailable"})
    refute_receive {:adapter, "native", _}, 20
  end

  test "native operations remain opaque and only matching canonical results are confirmed" do
    operation = opaque_operation()
    canonical = %{"version" => 1, "requestId" => operation["requestId"], "result" => %{"groups" => []}}
    reply("native", {:ok, canonical})
    {:ok, _, socket} = native_join()
    ref = push(socket, "encrypted.operation", operation)
    assert_reply(ref, :ok, ^canonical)
    assert_receive {:adapter, "native", ^operation}
    refute_receive {:adapter, "receipt", _}, 20
    for response <- [%{}, %{canonical | "requestId" => "wrong"}, %{canonical | "result" => []}] do
      reply("native", {:ok, response})
      ref = push(socket, "encrypted.operation", operation)
      assert_reply(ref, :error, %{code: "outcome_unknown"})
    end
  end

  test "native malformed and oversized frames never reach the adapter" do
    {:ok, _, socket} = native_join()
    for operation <- [[], Map.put(opaque_operation(), "payload", %{"ciphertext" => String.duplicate("x", 24_001)})] do
      ref = push(socket, "encrypted.operation", operation)
      assert_reply(ref, :error, %{code: "invalid_request"})
    end
    refute_receive {:adapter, "native", _}, 20
  end

  test "native rate/upstream failures do not fabricate acceptance and revoked sessions close" do
    {:ok, _, socket} = native_join()
    reply("native", {:error, :rejected})
    ref = push(socket, "encrypted.operation", opaque_operation())
    assert_reply(ref, :error, %{code: "rejected"})
    # Adapter maps backend 429 and 503 to unavailable; neither is acceptance.
    reply("native", {:error, :unavailable})
    ref = push(socket, "encrypted.operation", opaque_operation())
    assert_reply(ref, :error, %{code: "outcome_unknown"})
    monitor = Process.monitor(socket.channel_pid)
    reply("native", {:error, :unauthorized})
    push(socket, "encrypted.operation", opaque_operation())
    assert_receive {:DOWN, ^monitor, :process, _, :normal}
  end

  test "native command rate budget remains bounded" do
    {:ok, _, socket} = native_join()
    reply("native", {:error, :unavailable})
    for _ <- 1..20 do
      ref = push(socket, "encrypted.operation", opaque_operation())
      assert_reply(ref, :error, %{code: "outcome_unknown"})
    end
    monitor = Process.monitor(socket.channel_pid)
    push(socket, "encrypted.operation", opaque_operation())
    assert_receive {:DOWN, ^monitor, :process, _, :normal}
  end
end
