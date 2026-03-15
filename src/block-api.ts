/**
 * Centralized read/write API for .workflow/*.json project block files.
 * Validates data against schemas before writing; uses atomic writes (tmp + rename).
 * Future extraction seam for pi-project extension.
 */
import fs from "node:fs";
import path from "node:path";
import { validateFromFile } from "./schema-validator.ts";

const WORKFLOW_DIR = ".workflow";
const SCHEMAS_DIR = "schemas";

function blockFilePath(cwd: string, blockName: string): string {
  return path.join(cwd, WORKFLOW_DIR, `${blockName}.json`);
}

function blockSchemaPath(cwd: string, blockName: string): string {
  return path.join(cwd, WORKFLOW_DIR, SCHEMAS_DIR, `${blockName}.schema.json`);
}

/**
 * Read and parse a .workflow/{blockName}.json file.
 * Throws if the file does not exist or contains invalid JSON.
 */
export function readBlock(cwd: string, blockName: string): unknown {
  const filePath = blockFilePath(cwd, blockName);
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(`Block file not found: .workflow/${blockName}.json`);
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in block file: .workflow/${blockName}.json: ${msg}`);
  }
}

/**
 * Validate data against its schema (if one exists) and write atomically
 * to .workflow/{blockName}.json. Throws ValidationError on schema failure.
 * Files without a corresponding schema are written without validation.
 */
export function writeBlock(cwd: string, blockName: string, data: unknown): void {
  const filePath = blockFilePath(cwd, blockName);
  const schemaFile = blockSchemaPath(cwd, blockName);

  // Validate before write (if schema exists)
  if (fs.existsSync(schemaFile)) {
    validateFromFile(schemaFile, data, `block file '${blockName}.json'`);
  }

  // Ensure directory exists
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Atomic write: tmp + rename
  const tmpPath = filePath + `.block-api-${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup of partial tmp file
    try { fs.unlinkSync(tmpPath); } catch { /* ignore cleanup failure */ }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write block file .workflow/${blockName}.json: ${msg}`);
  }
}

/**
 * Read current file, push item onto data[arrayKey], validate whole file
 * against schema, write atomically. Throws if file doesn't exist, if
 * arrayKey is missing or not an array, or if validation fails.
 */
export function appendToBlock(cwd: string, blockName: string, arrayKey: string, item: unknown): void {
  const data = readBlock(cwd, blockName);

  if (!data || typeof data !== "object") {
    throw new Error(`Block '${blockName}' is not an object`);
  }

  const record = data as Record<string, unknown>;
  if (!(arrayKey in record)) {
    throw new Error(`Block '${blockName}' has no key '${arrayKey}'`);
  }
  if (!Array.isArray(record[arrayKey])) {
    throw new Error(`Block '${blockName}' key '${arrayKey}' is not an array`);
  }

  record[arrayKey] = [...(record[arrayKey] as unknown[]), item];
  writeBlock(cwd, blockName, record);
}
