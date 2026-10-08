defmodule WingaConversations.MetricsTest do
  use ExUnit.Case, async: false
  import Plug.Test
  alias WingaConversations.{Metrics, Router}

  test "metrics exclude content, count fixed outcomes and remove dead connections" do
    before = Metrics.snapshot()
    Metrics.record(:send_accepted, 10)
    Metrics.record("PRIVATE CONTENT", 99)
    after_sample = Metrics.snapshot()
    before_count = Enum.find(before.counters, &(&1.event == :send_accepted)).count
    assert Enum.find(after_sample.counters, &(&1.event == :send_accepted)).count == before_count + 1
    refute Jason.encode!(after_sample) =~ "PRIVATE CONTENT"
    assert after_sample.beamMemoryBytes > 0
    pid = spawn(fn -> receive do :finish -> :ok end end)
    Metrics.track(pid)
    assert Metrics.snapshot().connections == before.connections + 1
    monitor = Process.monitor(pid)
    send(pid, :finish)
    assert_receive {:DOWN, ^monitor, :process, ^pid, _}
    # Wait for the tracker, not just the test process, to receive its DOWN.
    for _ <- 1..20, Metrics.snapshot().connections != before.connections, do: Process.sleep(5)
    assert Metrics.snapshot().connections == before.connections
  end

  test "ops route is protected and never exposes the control token" do
    secret = String.duplicate("s", 32)
    old = Application.get_env(:winga_conversations, :service_token)
    Application.put_env(:winga_conversations, :service_token, secret)
    on_exit(fn -> if old, do: Application.put_env(:winga_conversations, :service_token, old), else: Application.delete_env(:winga_conversations, :service_token) end)
    assert Router.call(conn(:get, "/ops/health"), Router.init([])).status == 401
    result = conn(:get, "/ops/health") |> Plug.Conn.put_req_header("authorization", "Bearer " <> secret) |> Router.call(Router.init([]))
    assert result.status == 200
    assert Plug.Conn.get_resp_header(result, "cache-control") == ["no-store"]
    refute result.resp_body =~ secret
    assert Jason.decode!(result.resp_body)["privacy"] == "aggregate-only"
  end
end
