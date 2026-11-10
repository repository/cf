import { FilterError, parse, transform } from "onesixty";
import type { ASTNode, ASTRestrictionNode, ASTValueNode } from "onesixty";

type Condition = {
	key: string;
	type: "string" | "number" | "boolean";
	operation: string;
	value?: string | number | boolean;
};

export type Filter = Condition | Group;
export type Group = {
	kind: "group";
	filterCombination: "and" | "or";
	filters: Filter[];
};

function literal(node: ASTValueNode): Pick<Condition, "type" | "value"> {
	if (!node.quoted) {
		if (node.value === "true" || node.value === "false") {
			return { type: "boolean", value: node.value === "true" };
		}
		if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(node.value)) {
			const value = Number(node.value);
			if (!Number.isFinite(value)) {
				throw new Error("--filter numeric values must be finite.");
			}
			return { type: "number", value };
		}
	}
	return { type: "string", value: node.value };
}

function wildcard(key: string, pattern: string, negated: boolean): Filter {
	const parts = pattern.split("*");
	const text = parts.filter(Boolean);
	if (!text.length) {
		return { key, type: "string", operation: negated ? "is_null" : "exists" };
	}
	if (text.length === 1 && parts[0] === "" && parts.at(-1) === "") {
		return {
			key,
			type: "string",
			operation: negated ? "not_includes" : "includes",
			value: text[0],
		};
	}
	if (negated) {
		throw new Error(
			'--filter supports NOT with exact equality, presence checks, and "*text*" matches.'
		);
	}
	if (text.length === 1) {
		return {
			key,
			type: "string",
			operation: parts[0] === "" ? "ends_with" : "starts_with",
			value: text[0],
		};
	}
	const regex: Condition = {
		key,
		type: "string",
		operation: "regex",
		value: `^${parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]*")}$`,
	};
	const suffix = parts.at(-1);
	// A regex $ anchor also matches before a final newline.
	return suffix
		? {
				kind: "group",
				filterCombination: "and",
				filters: [
					regex,
					{ key, type: "string", operation: "ends_with", value: suffix },
				],
			}
		: regex;
}

function comparison(node: ASTRestrictionNode, negated: boolean): Filter {
	if (
		node.comparable.type !== "member" ||
		(node.arg.type !== "value" && node.arg.type !== "member")
	) {
		throw new Error(
			"--filter requires a field name and a literal comparison value."
		);
	}
	const arg: ASTValueNode =
		node.arg.type === "member"
			? {
					type: "value",
					value: node.arg.path.join("."),
					quoted: false,
					span: node.arg.span,
				}
			: node.arg;
	const key = node.comparable.path.join(".");
	if (node.comparator === ":") {
		if (arg.value !== "*") {
			throw new Error(
				'--filter uses field:* for presence. Use = for equality or = "*text*" for text matching.'
			);
		}
		return { key, type: "string", operation: negated ? "is_null" : "exists" };
	}
	if (node.comparator === "=" && arg.quoted && arg.value.includes("*")) {
		return wildcard(key, arg.value, negated);
	}
	const value = literal(arg);
	if (node.comparator === "=" || node.comparator === "!=") {
		return {
			key,
			...value,
			operation: (node.comparator === "=") !== negated ? "eq" : "neq",
		};
	}
	if (value.type !== "number") {
		throw new Error(
			"--filter ordering comparisons require an unquoted number."
		);
	}
	if (negated) {
		// The API's inverse range operators differ for missing or nonnumeric fields.
		throw new Error(
			"--filter requires an explicit numeric comparison instead of NOT around a range."
		);
	}
	const operations = {
		">": "gt",
		">=": "gte",
		"<": "lt",
		"<=": "lte",
	} as const;
	return { key, ...value, operation: operations[node.comparator] };
}

function toFilter(node: ASTNode, negated = false): Filter {
	switch (node.type) {
		case "and":
		case "or":
			return {
				kind: "group",
				filterCombination: negated
					? node.type === "and"
						? "or"
						: "and"
					: node.type,
				filters: node.children.map((child) => toFilter(child, negated)),
			};
		case "not":
			return toFilter(node.child, !negated);
		case "global": {
			if (node.value.type === "function") {
				break;
			}
			return {
				key: "$metadata.message",
				type: "string",
				operation: negated ? "not_includes" : "includes",
				value:
					node.value.type === "member"
						? node.value.path.join(".")
						: node.value.value,
			};
		}
		case "restriction":
			return comparison(node, negated);
	}
	throw new Error(
		"--filter requires field comparisons with literal values or message text."
	);
}

export function tailFilters(
	expression?: string
): Pick<Group, "filters" | "filterCombination"> {
	if (expression === undefined) {
		return { filters: [], filterCombination: "and" };
	}
	if (typeof expression !== "string" || !expression.trim()) {
		throw new Error("Use a single, non-empty --filter expression.");
	}
	let ast: ASTNode | null;
	try {
		ast = transform(parse(expression));
	} catch (error) {
		if (!(error instanceof FilterError)) {
			throw error;
		}
		throw new Error(
			`Invalid --filter${error.span ? ` at character ${error.span.start + 1}` : ""}: ${error.description}`
		);
	}
	if (!ast) {
		throw new Error("--filter requires a non-empty expression.");
	}
	const filter = toFilter(ast);
	return "kind" in filter
		? { filters: filter.filters, filterCombination: filter.filterCombination }
		: { filters: [filter], filterCombination: "and" };
}

export function zoneFilter(zone: string): Group {
	const name = zone.toLowerCase();
	const host = name
		.replaceAll(".", "\\.")
		.replace(/[a-z]/g, (letter) => `[${letter}${letter.toUpperCase()}]`);
	return {
		kind: "group",
		filterCombination: "or",
		filters: [
			{
				key: "cloudflare.zone_name",
				type: "string",
				operation: "eq",
				value: name,
			},
			{
				kind: "group",
				filterCombination: "and",
				filters: [
					{
						key: "cloudflare.zone_name",
						type: "string",
						operation: "is_null",
					},
					{
						key: "$metadata.url",
						type: "string",
						operation: "regex",
						value: `^[Hh][Tt][Tt][Pp][Ss]?://(?:[a-zA-Z0-9-]+\\.)*${host}\\.?(?::[0-9]+)?(?:[/?#]|$)`,
					},
				],
			},
		],
	};
}

export function scopeTailFilters(
	{ filters, filterCombination }: ReturnType<typeof tailFilters>,
	scope: Filter
): ReturnType<typeof tailFilters> {
	return {
		filterCombination: "and",
		filters: [
			scope,
			...(filterCombination === "and" || filters.length === 0
				? filters
				: [{ kind: "group" as const, filterCombination, filters }]),
		],
	};
}
