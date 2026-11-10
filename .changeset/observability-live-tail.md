---
"cf": minor
---

Add observability live tail

Stream live observability events with `cf observability tail`. Select `--all` for all observability events, `--worker` for a Worker, or `--zone` for zone events. Zone selection uses the recorded zone name, with request hostname matching for events without a zone name, including subdomains. Use `--filters` alone or with `--worker` or `--zone` to apply JSON filters, inline or from `@filters.json`. Run `cf schema observability tail` for the filter schema and examples.
