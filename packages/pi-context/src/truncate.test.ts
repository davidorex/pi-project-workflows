/**
 * Unit coverage for the vendored truncateHead (FGAP-104).
 *
 * truncateHead is transcribed verbatim from @earendil-works/pi-coding-agent
 * (dist/core/tools/truncate.js) so context-sdk's import graph carries no SDK
 * root-barrel value-import. These assertions pin the contract this repo relies
 * on: under-cap content passes through untouched; over-cap content is flagged
 * (truncated + truncatedBy) with the FULL byte count reported and a shorter
 * body; and byte accounting goes through Buffer.byteLength (multi-byte safe).
 * No I/O — every assertion operates on inline strings.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MAX_BYTES, truncateHead } from "./truncate.js";

describe("truncate: under-cap pass-through", () => {
	it("returns content unchanged with truncated:false and correct totalBytes", () => {
		const content = "line one\nline two\nline three";
		const res = truncateHead(content);
		assert.equal(res.truncated, false);
		assert.equal(res.truncatedBy, null);
		assert.equal(res.content, content);
		assert.equal(res.totalBytes, Buffer.byteLength(content, "utf-8"));
		assert.equal(res.totalLines, 3);
		assert.equal(res.firstLineExceedsLimit, false);
	});
});

describe("truncate: over-cap truncation", () => {
	it("flags truncation, reports full totalBytes, and shortens content", () => {
		// Build a string comfortably over the 50KB byte cap out of many short lines
		// (each line well under maxBytes, so truncation is by accumulated bytes).
		const line = "x".repeat(100);
		const lineCount = Math.ceil((DEFAULT_MAX_BYTES * 2) / (line.length + 1));
		const content = Array.from({ length: lineCount }, () => line).join("\n");
		const fullBytes = Buffer.byteLength(content, "utf-8");
		assert.ok(fullBytes > DEFAULT_MAX_BYTES, "fixture must exceed the byte cap");

		const res = truncateHead(content);
		assert.equal(res.truncated, true);
		assert.equal(res.truncatedBy, "bytes");
		// Full (un-capped) byte length is reported regardless of truncation.
		assert.equal(res.totalBytes, fullBytes);
		// Served content is strictly shorter than the input and within the cap.
		assert.ok(res.content.length < content.length, "content must be shortened");
		assert.ok(Buffer.byteLength(res.content, "utf-8") <= DEFAULT_MAX_BYTES);
		assert.equal(res.firstLineExceedsLimit, false);
	});

	it("truncates by lines when the line cap is hit before the byte cap", () => {
		const content = Array.from({ length: 60 }, (_, i) => `row-${i}`).join("\n");
		const res = truncateHead(content, { maxLines: 10 });
		assert.equal(res.truncated, true);
		assert.equal(res.truncatedBy, "lines");
		assert.equal(res.outputLines, 10);
		assert.equal(res.totalLines, 60);
	});
});

describe("truncate: byte accounting", () => {
	it("uses Buffer.byteLength for multi-byte content", () => {
		// "héllo €" — multi-byte chars: é = 2 bytes, € = 3 bytes.
		const content = "héllo €";
		const expectedBytes = Buffer.byteLength(content, "utf-8");
		assert.notEqual(expectedBytes, content.length, "fixture must be multi-byte");
		const res = truncateHead(content);
		assert.equal(res.totalBytes, expectedBytes);
		assert.equal(res.truncated, false);
		assert.equal(res.content, content);
	});
});
