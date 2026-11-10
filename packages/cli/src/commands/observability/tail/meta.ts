import type { LeafCommandMeta } from "../../../lib/command-meta.js";

export default {
	command: "cf observability tail",
	name: "tail",
	fullPath: ["observability", "tail"],
	category: "read",
	description:
		'Stream live observability events as newline-delimited JSON. Select --all for all events, --worker for a deployed Worker, --zone for zone events with a hostname fallback that includes subdomains, or --filter for matching observability events. Worker events require Workers logs. Each user can run one live tail per Worker and one account live tail, shared by --all, --zone, and --filter alone. Streaming connections use HTTPS_PROXY and NO_PROXY. --worker requires Worker metadata access. --zone requires Zone read access. Choose one of --all, --worker, or --zone. Use --filter alone or with --worker or --zone. --filter accepts =, !=, numeric < <= > >=, AND, OR, NOT, parentheses, and field:* for presence. OR binds more tightly than AND; use parentheses to group conditions. Groups can nest up to four levels. Quote string values; leave numbers and true/false unquoted. String matching is case-sensitive. Use * in quoted = values for wildcards. Bare text searches $metadata.message. NOT supports exact equality, presence checks, and "*text*" matches. Example: --filter \'($metadata.service = "my-worker" AND $metadata.level = "error") OR $metadata.message = "*failed*"\'. Use cf o11y telemetry keys and cf o11y telemetry values to discover fields and values.',
	summary: "Stream observability events",
	search: {
		keywords: [
			"worker logs",
			"live logs",
			"streaming",
			"realtime",
			"console logs",
			"request logs",
			"debugging",
			"exceptions",
			"wrangler tail",
		],
	},
	usage: "cf observability tail [options]",
	arguments: [],
	options: [
		{
			name: "all",
			type: "boolean",
			required: false,
			description: "Stream all observability events",
		},
		{
			name: "worker",
			type: "string",
			required: false,
			description: "Deployed Worker script name",
		},
		{
			name: "filter",
			type: "string",
			required: false,
			description: 'Filter expression, e.g. $metadata.level = "error"',
		},
		{
			name: "dry-run",
			type: "boolean",
			required: false,
			default: false,
			description: "Preview the live tail request",
		},
	],
} satisfies LeafCommandMeta;
