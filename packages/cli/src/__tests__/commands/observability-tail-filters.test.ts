import { describe, expect, it } from "vite-plus/test";
import {
	scopeTailFilters,
	tailFilters,
	zoneFilter,
} from "../../commands/observability/tail/filters.js";

describe("live tail filter expressions", () => {
	it.each([
		['$metadata.level = "error"', "$metadata.level", "eq", "string", "error"],
		["$workers.outcome != ok", "$workers.outcome", "neq", "string", "ok"],
		[
			'$workers.scriptVersion.id = "123"',
			"$workers.scriptVersion.id",
			"eq",
			"string",
			"123",
		],
		["$workers.cpuTimeMs > 50", "$workers.cpuTimeMs", "gt", "number", 50],
		[
			"$workers.wallTimeMs >= 1.5e2",
			"$workers.wallTimeMs",
			"gte",
			"number",
			150,
		],
		[
			"$workers.event.response.status < 500",
			"$workers.event.response.status",
			"lt",
			"number",
			500,
		],
		["offset <= -0.5", "offset", "lte", "number", -0.5],
		["cached = true", "cached", "eq", "boolean", true],
		["cached != false", "cached", "neq", "boolean", false],
		["host = api.example.com", "host", "eq", "string", "api.example.com"],
	] as const)(
		"translates %s with the correct value type",
		(expression, key, operation, type, value) => {
			expect(tailFilters(expression)).toEqual({
				filterCombination: "and",
				filters: [{ key, type, operation, value }],
			});
		}
	);

	it("honors onesixty's OR precedence and explicit parentheses", () => {
		const a = { key: "a", type: "number", operation: "eq", value: 1 };
		const b = { key: "b", type: "number", operation: "eq", value: 2 };
		const c = { key: "c", type: "number", operation: "eq", value: 3 };
		expect(tailFilters("a = 1 AND b = 2 OR c = 3")).toEqual({
			filterCombination: "and",
			filters: [a, { kind: "group", filterCombination: "or", filters: [b, c] }],
		});
		expect(tailFilters("(a = 1 AND b = 2) OR c = 3")).toEqual({
			filterCombination: "or",
			filters: [
				{ kind: "group", filterCombination: "and", filters: [a, b] },
				c,
			],
		});
	});

	it("combines whitespace-separated message searches with AND", () => {
		expect(tailFilters('"request failed" timeout')).toEqual({
			filterCombination: "and",
			filters: ["request failed", "timeout"].map((value) => ({
				key: "$metadata.message",
				type: "string",
				operation: "includes",
				value,
			})),
		});
	});

	it("negates groups, exact comparisons, presence, and message searches", () => {
		expect(
			tailFilters('NOT (level = "debug" OR requestId:*) AND -"health check"')
		).toEqual({
			filterCombination: "and",
			filters: [
				{
					kind: "group",
					filterCombination: "and",
					filters: [
						{ key: "level", type: "string", operation: "neq", value: "debug" },
						{ key: "requestId", type: "string", operation: "is_null" },
					],
				},
				{
					key: "$metadata.message",
					type: "string",
					operation: "not_includes",
					value: "health check",
				},
			],
		});
		expect(tailFilters("NOT (NOT cached = true)").filters).toEqual([
			{ key: "cached", type: "boolean", operation: "eq", value: true },
		]);
	});

	it("translates presence and substring matching to native operations", () => {
		expect(
			tailFilters('$metadata.error:* AND $metadata.message = "*failed*"')
		).toEqual({
			filterCombination: "and",
			filters: [
				{ key: "$metadata.error", type: "string", operation: "exists" },
				{
					key: "$metadata.message",
					type: "string",
					operation: "includes",
					value: "failed",
				},
			],
		});
		expect(tailFilters('NOT message = "*health check*"').filters).toEqual([
			{
				key: "message",
				type: "string",
				operation: "not_includes",
				value: "health check",
			},
		]);
		expect(tailFilters('message = "*"').filters).toEqual([
			{ key: "message", type: "string", operation: "exists" },
		]);
	});

	it.each([
		['trigger = "GET *"', "trigger", "starts_with", "GET "],
		['host = "*.example.com"', "host", "ends_with", ".example.com"],
	] as const)(
		"translates %s to a native text comparison",
		(expression, key, operation, value) => {
			expect(tailFilters(expression).filters).toEqual([
				{ key, type: "string", operation, value },
			]);
		}
	);

	it("preserves wildcard boundaries, literal regex characters, and newlines", () => {
		const result = tailFilters('message = "[error]*($5)"');
		expect(result).toMatchObject({
			filterCombination: "and",
			filters: [
				{ key: "message", type: "string", operation: "regex" },
				{
					key: "message",
					type: "string",
					operation: "ends_with",
					value: "($5)",
				},
			],
		});
		const [regex, suffix] = result.filters;
		if (
			!regex ||
			"kind" in regex ||
			typeof regex.value !== "string" ||
			!suffix ||
			"kind" in suffix ||
			typeof suffix.value !== "string"
		) {
			throw new Error("Expected string conditions");
		}
		const pattern = new RegExp(regex.value);
		const suffixValue = suffix.value;
		const matches = (value: string) =>
			pattern.test(value) && value.endsWith(suffixValue);
		expect(matches("[error]\nrequest failed ($5)")).toBe(true);
		expect(matches("[error] request failed ($50)")).toBe(false);
		expect(matches("[error] request failed ($5)\n")).toBe(false);
	});

	it.each([
		["", /non-empty/],
		["x =", /Invalid --filter/],
		['x > "1"', /unquoted number/],
		["x = 1e999", /finite/],
		["x:word", /field:\*/],
		["fn()", /literal values or message text/],
		["fn() = 1", /literal comparison value/],
		["x = fn()", /literal comparison value/],
		["NOT x > 1", /explicit numeric comparison/],
		['NOT x = "prefix*"', /exact equality/],
	] as const)(
		"rejects unsupported or invalid expression %s",
		(expression, error) => {
			expect(() => tailFilters(expression)).toThrow(error);
		}
	);
});

describe("zone selection", () => {
	const selection = zoneFilter("Example.COM");
	const fallback = selection.filters[1];
	if (!fallback || !("kind" in fallback)) {
		throw new Error("Expected a hostname fallback group.");
	}
	const hostname = fallback.filters[1];
	if (!hostname || "kind" in hostname) {
		throw new Error("Expected a URL hostname condition.");
	}
	const matches = (url: string) => new RegExp(String(hostname.value)).test(url);

	it("prefers the processing zone and uses a hostname fallback for absent zone fields", () => {
		expect(selection).toEqual({
			kind: "group",
			filterCombination: "or",
			filters: [
				{
					key: "cloudflare.zone_name",
					type: "string",
					operation: "eq",
					value: "example.com",
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
							value: expect.any(String),
						},
					],
				},
			],
		});
	});

	it.each([
		"https://example.com/",
		"http://example.com/path?view=all",
		"https://api.dev.example.com/",
		"https://example.com:8443/",
		"https://api.example.com.:8443/",
		"https://example.com",
		"https://example.com?query=1",
		"HTTPS://API.EXAMPLE.COM/path",
	])("matches the zone domain or its subdomains: %s", (url) => {
		expect(matches(url)).toBe(true);
	});

	it.each([
		"https://notexample.com/",
		"https://example.com.evil.test/",
		"https://exampleXcom/",
		"https://example.com@evil.test/",
		"https://evil.test/path/example.com/",
		"example.com",
	])("rejects unrelated request hostnames: %s", (url) => {
		expect(matches(url)).toBe(false);
	});

	it("ANDs the zone selection with a user's OR group", () => {
		const userFilters = tailFilters(
			'$metadata.level = "error" OR $metadata.level = "warn"'
		);
		const scope = zoneFilter("example.com");
		expect(scopeTailFilters(userFilters, scope)).toEqual({
			filterCombination: "and",
			filters: [scope, { kind: "group", ...userFilters }],
		});
	});
});
