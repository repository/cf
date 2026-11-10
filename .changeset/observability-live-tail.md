---
"cf": minor
---

Add observability live tail

Stream live observability events with `cf observability tail`. Select `--all` for all observability events, `--worker` for a Worker, or `--zone` for zone events. Zone selection uses the recorded zone name, with request hostname matching for events without a zone name, including subdomains. Use `--filter` alone or with `--worker` or `--zone` to match fields, for example `--filter '$metadata.level = "error"'`.
