#!/bin/bash
set -e

cd "$(dirname "$0")/.."

node --experimental-strip-types -e "
import { validateFromFile } from './src/schema-validator.ts';
import fs from 'fs';
import path from 'path';

const blocks = [
  ['.workflow/schemas/project.schema.json', '.workflow/project.json', 'project'],
  ['.workflow/schemas/architecture.schema.json', '.workflow/architecture.json', 'architecture'],
  ['.workflow/schemas/conventions.schema.json', '.workflow/conventions.json', 'conventions'],
  ['.workflow/schemas/decisions.schema.json', '.workflow/decisions.json', 'decisions'],
  ['.workflow/schemas/state.schema.json', '.workflow/state.json', 'state'],
];

// Validate top-level blocks
for (const [schema, data, label] of blocks) {
  const json = JSON.parse(fs.readFileSync(data, 'utf-8'));
  validateFromFile(schema, json, label);
  console.log('✓', label);
}

// Validate phase blocks
const phaseSchema = '.workflow/schemas/phase.schema.json';
const phasesDir = '.workflow/phases';
const phaseFiles = fs.readdirSync(phasesDir).filter(f => f.endsWith('.json')).sort();

for (const file of phaseFiles) {
  const filePath = path.join(phasesDir, file);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const label = 'phase: ' + file;
  validateFromFile(phaseSchema, json, label);
  console.log('✓', label);
}

console.log('');
console.log('All', blocks.length + phaseFiles.length, 'blocks validated successfully.');
"
