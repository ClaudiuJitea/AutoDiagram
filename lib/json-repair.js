/**
 * Simple and effective JSON closure repair utilities.
 *
 * Handles common LLM output issues:
 * - Strips Markdown code fences
 * - Extracts the first JSON object/array from mixed text
 * - Closes unbalanced quotes/brackets/braces at the end
 * - Inserts missing '{' for array-of-object cases: ["k":1] -> [{"k":1}]
 * - Trims trailing comma before auto-appended closers
 * - Falls back to jsonrepair (npm) if parsing still fails
 */

import { jsonrepair } from 'jsonrepair';
const jsonRepairLib = jsonrepair;

/**
 * Remove leading/trailing Markdown code fences.
 */
function stripCodeFences(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text.trim();
  s = s.replace(/^```(?:json|javascript|js)?\s*\n?/i, '');
  s = s.replace(/\n?```\s*$/i, '');
  return s.trim();
}

function trimTrailingComma(out) {
  let i = out.length - 1;
  // skip whitespace
  while (i >= 0 && /\s/.test(out[i])) i--;
  if (i >= 0 && out[i] === ',') {
    return out.slice(0, i) + out.slice(i + 1);
  }
  return out;
}

function normalizeCommonJsonMistakes(input) {
  if (!input || typeof input !== 'string') return input;

  let out = input
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  // Quote bare object keys: { type: "rectangle" } -> { "type": "rectangle" }
  out = out.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g, '$1"$2"$3');

  // Repair a comma accidentally used between a quoted key and its value.
  // Only match simple keys (no colon inside the quotes) to avoid false positives.
  out = out.replace(
    /([{,]\s*"[^":"\n\r]+")\s*,\s*(?=(?:"|true|false|null|-?\d|\{|\[))/g,
    '$1: '
  );

  // Repair a missing colon between a quoted key and its value.
  // Only match simple keys (no colon inside the quotes) to avoid false positives.
  out = out.replace(
    /([{,]\s*"[^":"\n\r]+")\s+(?=(?:"|true|false|null|-?\d|\{|\[))/g,
    '$1: '
  );

  // Remove dangling commas before object/array closers.
  out = out.replace(/,\s*([}\]])/g, '$1');

  return out;
}

/**
 * Extracts the first JSON block (object or array) and repairs unclosed parts.
 * Returns the repaired JSON substring. If no JSON-like content found, returns original.
 *
 * This function is designed to be conservative: it only appends missing
 * quotes/brackets/braces and removes a trailing comma if present.
 */
export function repairJsonClosure(input) {
  if (!input || typeof input !== 'string') return input;

  const source = normalizeCommonJsonMistakes(stripCodeFences(input));
  let start = -1;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '{' || c === '[') { start = i; break; }
  }
  if (start === -1) return source; // no obvious JSON start

  let inString = false;
  let escape = false;
  const stack = [];
  let out = '';
  let insertedObjectAfterArrayStart = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    out += ch;

    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = false; continue; }
      continue;
    }

    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { stack.push('}'); continue; }
    if (ch === '[') {
      stack.push(']');
      // Heuristic: if after '[' we see a property-like token ("key": ...)
      // before a comma or ']', assume missing '{' and insert it.
      if (!insertedObjectAfterArrayStart) {
        const nextIdx = findNextNonWsIndex(source, i + 1);
        if (nextIdx !== -1) {
          if (looksLikeMissingObjectAfterArray(source, nextIdx)) {
            out += '{';
            stack.push('}');
            insertedObjectAfterArrayStart = true;
          }
        }
      }
      continue;
    }
    if (ch === '}' || ch === ']') {
      // Close only if matches top
      if (stack.length && stack[stack.length - 1] === ch) {
        stack.pop();
      }
      // If we've closed the root (stack empty), stop collecting
      if (stack.length === 0) {
        // Cut here to avoid trailing commentary
        break;
      }
    }
  }

  // If still inside a string, close it
  if (inString) {
    out += '"';
    inString = false;
  }

  // Remove a trailing comma before appending closers
  out = trimTrailingComma(out);

  // Append any missing closers
  while (stack.length) out += stack.pop();

  // If still not parseable, try robust repair if available
  try {
    JSON.parse(out);
  } catch (_) {
    if (jsonRepairLib) {
      try { out = jsonRepairLib(out); } catch (_) { /* ignore */ }
    }
  }

  return out;
}

/**
 * Safely parse JSON with multi-stage repair. Returns { ok, value, error }.
 *
 * Fallback chain (most reliable first):
 *   1. Raw JSON.parse
 *   2. jsonrepair on raw input (no regex pre-processing that could corrupt it)
 *   3. jsonrepair on code-fence-stripped input
 *   4. Custom closure repair (bracket/brace balancing only)
 *   5. Full regex normalization + closure repair
 *   6. jsonrepair on regex-normalized input (last resort)
 */
export function safeParseJsonWithRepair(input) {
  let lastError;

  // 1. Direct parse
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (e) { lastError = e; }

  // 2. jsonrepair on raw input — most reliable, no pre-processing
  if (jsonRepairLib) {
    try {
      return { ok: true, value: JSON.parse(jsonRepairLib(input)) };
    } catch (_) {}
  }

  // 3. jsonrepair on code-fence-stripped input
  if (jsonRepairLib) {
    try {
      const stripped = stripCodeFences(input);
      return { ok: true, value: JSON.parse(jsonRepairLib(stripped)) };
    } catch (_) {}
  }

  // 4. Closure repair only (bracket/brace balancing, no regex normalization)
  try {
    const repaired = repairJsonClosure(input);
    return { ok: true, value: JSON.parse(repaired) };
  } catch (e) { lastError = e; }

  // 5. Regex normalization + closure repair
  try {
    const repaired = normalizeCommonJsonMistakes(repairJsonClosure(input));
    return { ok: true, value: JSON.parse(repaired) };
  } catch (e) { lastError = e; }

  // 6. jsonrepair on regex-normalized input (last resort)
  if (jsonRepairLib) {
    try {
      const normalized = normalizeCommonJsonMistakes(input);
      return { ok: true, value: JSON.parse(jsonRepairLib(normalized)) };
    } catch (_) {}
  }

  return { ok: false, error: lastError };
}

// Helpers
function findNextNonWsIndex(str, from) {
  for (let i = from; i < str.length; i++) {
    if (!/\s/.test(str[i])) return i;
  }
  return -1;
}

function looksLikeMissingObjectAfterArray(str, from) {
  // true if we encounter a pattern like "key" : before ',' or ']'
  let inString = false;
  let escape = false;
  for (let i = from; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = false; continue; }
      continue;
    }
    if (/\s/.test(ch)) continue;
    if (ch === ']') return false;
    if (ch === '{') return false;
    if (ch === ',') return false;
    if (ch === '"') {
      return hasColonBeforeCommaOrBracket(str, i + 1);
    }
    // if we see an unquoted identifier, likely an object key (invalid JSON)
    if (/[_A-Za-z]/.test(ch)) return true;
    return false;
  }
  return false;
}

function hasColonBeforeCommaOrBracket(str, from) {
  let inString = false;
  let escape = false;
  for (let i = from; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = false; continue; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === ':') return true;
    if (ch === ',' || ch === ']') return false;
  }
  return false;
}
