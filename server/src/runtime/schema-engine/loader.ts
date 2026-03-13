/**
 * loader.ts — Load and validate a V2 Game Package from a YAML file.
 *
 * Responsibilities:
 * - Read YAML from disk
 * - Parse YAML into a plain object
 * - Validate against GamePackageSchema
 * - Return a typed GamePackage or throw with clear error messages
 */

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { GamePackageSchema, type GamePackage } from './schema.js';

/**
 * Format a ZodError into human-readable messages with field paths.
 * Example: "phases.submit_lie.input.primitive: Required"
 */
export function formatZodErrors(error: ZodError): string[] {
  return error.errors.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  });
}

/**
 * Load and validate a V2 Game Package from a YAML file path.
 *
 * @throws Error with clear message if the file can't be read, parsed, or validated.
 */
export function loadGamePackage(yamlPath: string): GamePackage {
  // Read file
  let rawYaml: string;
  try {
    rawYaml = readFileSync(yamlPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `[schema-engine] Failed to read game package file "${yamlPath}": ${String(err)}`,
    );
  }

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(rawYaml);
  } catch (err) {
    throw new Error(
      `[schema-engine] Failed to parse YAML in "${yamlPath}": ${String(err)}`,
    );
  }

  // Validate
  const result = GamePackageSchema.safeParse(parsed);
  if (!result.success) {
    const errors = formatZodErrors(result.error);
    throw new Error(
      `[schema-engine] Invalid game package "${yamlPath}":\n` +
        errors.map((e) => `  - ${e}`).join('\n'),
    );
  }

  return result.data;
}

/**
 * Validate a plain object against GamePackageSchema without throwing.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */
export function validateGamePackage(data: unknown): { valid: boolean; errors?: string[] } {
  const result = GamePackageSchema.safeParse(data);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: formatZodErrors(result.error),
  };
}
