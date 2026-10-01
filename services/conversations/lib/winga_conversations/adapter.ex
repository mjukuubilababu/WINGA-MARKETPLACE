defmodule WingaConversations.Adapter do
  @max_response 524_288

  def request(ticket, command, payload) do
    url =
      Application.fetch_env!(:winga_conversations, :backend_url) <>
        "/api/internal/conversations/command"

    headers = [
      {"content-type", "application/json"},
      {"authorization", "Bearer " <> Application.fetch_env!(:winga_conversations, :service_token)}
    ]

    body = Jason.encode!(%{version: 1, ticket: ticket, command: command, payload: payload})
    request = Finch.build(:post, url, headers, body)

    result =
      Finch.stream_while(
        request,
        WingaConversations.HTTP,
        %{status: nil, body: [], bytes: 0},
        fn
          {:status, status}, acc ->
            {:cont, %{acc | status: status}}

          {:headers, _}, acc ->
            {:cont, acc}

          {:trailers, _}, acc ->
            {:cont, acc}

          {:data, bytes}, acc ->
            size = acc.bytes + byte_size(bytes)

            if size > @max_response,
              do: {:halt, %{acc | status: 503, body: []}},
              else: {:cont, %{acc | body: [bytes | acc.body], bytes: size}}
        end,
        receive_timeout: 3_000,
        request_timeout: 4_000,
        pool_timeout: 1_000
      )

    case result do
      {:ok, %{status: 200, body: chunks}} ->
        case chunks |> Enum.reverse() |> IO.iodata_to_binary() |> Jason.decode() do
          {:ok, value} when is_map(value) -> {:ok, value}
          _ -> {:error, :unavailable}
        end

      {:ok, %{status: status}} when status in [401, 403] ->
        {:error, :unauthorized}

      {:ok, %{status: status}} when status in [400, 404, 409, 410, 413] ->
        {:error, :rejected}

      _ ->
        {:error, :unavailable}
    end
  rescue
    _ -> {:error, :unavailable}
  end
end
