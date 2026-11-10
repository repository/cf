export const filterSchema = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	title: "Live tail filters",
	description:
		'Combine conditions using "and" (all must match) or "or" (any must match). Groups can nest up to four levels. Discover fields and values with cf o11y telemetry keys and cf o11y telemetry values.',
	type: "object",
	required: ["filterCombination", "filters"],
	additionalProperties: false,
	properties: {
		filterCombination: {
			type: "string",
			enum: ["and", "or"],
			description: "How to combine the top-level filters.",
		},
		filters: {
			type: "array",
			items: {
				$ref: "#/$defs/filter",
			},
			description: "Conditions and nested groups.",
		},
	},
	$defs: {
		filter: {
			oneOf: [
				{
					$ref: "#/$defs/condition",
				},
				{
					$ref: "#/$defs/group",
				},
			],
		},
		condition: {
			type: "object",
			required: ["key", "type", "operation"],
			properties: {
				kind: {
					const: "filter",
					description: "Optional discriminator for a condition.",
				},
				key: {
					type: "string",
					description:
						"Event field name. Discover fields with cf o11y telemetry keys.",
				},
				type: {
					type: "string",
					enum: ["string", "number", "boolean"],
					description: "The data type of the event field.",
				},
				operation: {
					type: "string",
					enum: [
						"eq",
						"neq",
						"gt",
						"gte",
						"lt",
						"lte",
						"includes",
						"not_includes",
						"starts_with",
						"ends_with",
						"regex",
						"in",
						"not_in",
						"exists",
						"is_null",
					],
					description:
						"Use eq/neq for equality; gt/gte/lt/lte for numeric comparisons; includes/not_includes/starts_with/ends_with for case-sensitive text matching; regex for RE2 patterns; in/not_in for comma-separated values; exists/is_null for presence.",
				},
				value: {
					type: ["string", "number", "boolean"],
					description:
						"Comparison value with the same type as the field. Use a comma-separated string for in/not_in. Omit for exists/is_null.",
				},
			},
		},
		group: {
			type: "object",
			required: ["kind", "filterCombination", "filters"],
			properties: {
				kind: {
					const: "group",
				},
				filterCombination: {
					type: "string",
					enum: ["and", "or"],
					description: "How to combine this group’s child filters.",
				},
				filters: {
					type: "array",
					minItems: 1,
					items: {
						$ref: "#/$defs/filter",
					},
				},
			},
		},
	},
	examples: [
		{
			filterCombination: "and",
			filters: [
				{
					key: "$metadata.level",
					type: "string",
					operation: "eq",
					value: "error",
				},
			],
		},
		{
			filterCombination: "and",
			filters: [
				{
					key: "$metadata.level",
					type: "string",
					operation: "eq",
					value: "error",
				},
				{
					kind: "group",
					filterCombination: "or",
					filters: [
						{
							key: "$metadata.service",
							type: "string",
							operation: "eq",
							value: "checkout",
						},
						{
							key: "$metadata.service",
							type: "string",
							operation: "eq",
							value: "payments",
						},
					],
				},
			],
		},
	],
} as const;
