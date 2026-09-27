# Metrics and alerts

The API exports OpenTelemetry traces, metrics, and logs to the Collector over OTLP/gRPC. The Collector forwards all three signals to Alloy on the internal port `4317`. Alloy sends traces to Jaeger, metrics to Prometheus by remote write, and logs to Loki. Prometheus scrapes Alloy's internal metrics on port `4201` and the Redis exporter every 15 seconds; Alertmanager sends firing and resolved alerts by email.

## SMTP configuration

Set these values in `.env` before starting Alertmanager:

| Variable | Purpose |
| --- | --- |
| `SMTP_SMARTHOST` | SMTP `host:port`; defaults to `smtp.gmail.com:587`. Port 587 uses STARTTLS; port 465 uses implicit TLS. |
| `SMTP_FROM` | Sender address; defaults to `SMTP_USERNAME`. Set it when the provider requires a separate sender. |
| `SMTP_USERNAME` | SMTP authentication username; required. |
| `SMTP_PASSWORD` | SMTP authentication password or app password; required. |
| `ALERT_EMAIL_TO` | Recipient address; defaults to `SMTP_USERNAME`. |

TLS remains required. The password is written to a private temporary file in the Alertmanager container and is not rendered into its YAML configuration. Do not commit `.env`.

Prometheus can collect metrics even when Alertmanager has not been configured. Once the SMTP variables are set, start it with `docker compose up -d alertmanager`.

## Explore metrics

Open Prometheus at `http://localhost:9090` (or `PROMETHEUS_PORT`) and check:

```promql
up{job="alloy"}
nodejs_eventloop_utilization_ratio{service_name="interviewiq-api"}
http_server_request_duration_seconds_count{service_name="interviewiq-api"}
up{job="redis"}
redis_up{job="redis"}
redis_connected_clients{job="redis"}
redis_memory_used_bytes{job="redis"}
```

Send an HTTP request to the API before checking its request histogram. The API runtime metric may take about a minute to appear after startup. View firing and pending alerts in Prometheus at `/alerts` or Alertmanager at `http://localhost:9093` (or `ALERTMANAGER_PORT`).

The API latency alert uses a 5-minute average above 2 seconds for 1 minute; the 5xx alert uses a rate above 5% for 2 minutes. Both require at least 20 requests in the 5-minute window. The Alloy and Redis availability alerts require 1 minute. Missing API runtime telemetry alerts after Prometheus marks the metric absent and that condition holds for 2 minutes.

## Validate configuration and rules

```sh
docker compose config --quiet
docker run --rm --entrypoint /bin/promtool -v "$PWD/monitoring/prometheus:/etc/prometheus:ro" -w /etc/prometheus prom/prometheus:latest check config /etc/prometheus/prometheus.yml
docker run --rm --entrypoint /bin/promtool -v "$PWD/monitoring/prometheus:/etc/prometheus:ro" -w /etc/prometheus prom/prometheus:latest test rules alert.rules.test.yml
docker compose run --rm -e SMTP_SMARTHOST=smtp.example.test:465 -e SMTP_FROM=alerts@example.test -e SMTP_USERNAME=login@example.test -e SMTP_PASSWORD=test -e ALERT_EMAIL_TO=ops@example.test alertmanager --check
```

The last command renders and checks the Alertmanager config without starting its server or sending mail. For an end-to-end delivery check, configure a local SMTP test server and send a synthetic alert to that test recipient; do not use a real recipient for the smoke test.
