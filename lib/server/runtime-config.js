import { existsSync, readFileSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env.local');
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TYPE = 'openrouter';

const MANAGED_KEYS = [
  'SERVER_LLM_API_KEY',
  'SERVER_LLM_BASE_URL',
  'SERVER_LLM_TYPE',
  'SERVER_LLM_MODEL',
];

export function getRuntimeConfig() {
  const persisted = readRuntimeConfigFromDisk();
  return {
    apiKey: persisted.SERVER_LLM_API_KEY || process.env.SERVER_LLM_API_KEY || '',
    baseUrl: persisted.SERVER_LLM_BASE_URL || process.env.SERVER_LLM_BASE_URL || DEFAULT_BASE_URL,
    model: persisted.SERVER_LLM_MODEL || process.env.SERVER_LLM_MODEL || '',
  };
}

export function getRuntimeConfigStatus() {
  const config = getRuntimeConfig();
  const missingFields = [];

  if (!config.apiKey?.trim()) missingFields.push('apiKey');
  if (!config.baseUrl?.trim()) missingFields.push('baseUrl');
  if (!config.model?.trim()) missingFields.push('model');

  return {
    configured: missingFields.length === 0,
    missingFields,
  };
}

export async function persistRuntimeConfig(nextConfig) {
  const currentFile = await readEnvFile();
  const updates = {
    SERVER_LLM_API_KEY: String(nextConfig.apiKey ?? '').trim(),
    SERVER_LLM_BASE_URL: String(nextConfig.baseUrl ?? '').trim(),
    SERVER_LLM_TYPE: DEFAULT_TYPE,
    SERVER_LLM_MODEL: String(nextConfig.model ?? '').trim(),
  };
  const content = mergeManagedEnvBlock(currentFile, updates);

  process.env.SERVER_LLM_API_KEY = updates.SERVER_LLM_API_KEY;
  process.env.SERVER_LLM_BASE_URL = updates.SERVER_LLM_BASE_URL;
  process.env.SERVER_LLM_TYPE = updates.SERVER_LLM_TYPE;
  process.env.SERVER_LLM_MODEL = updates.SERVER_LLM_MODEL;

  await writeFile(ENV_PATH, content, 'utf8');
}

async function readEnvFile() {
  try {
    return await readFile(ENV_PATH, 'utf8');
  } catch {
    return buildManagedEnvBlock({
      SERVER_LLM_API_KEY: process.env.SERVER_LLM_API_KEY || '',
      SERVER_LLM_BASE_URL: process.env.SERVER_LLM_BASE_URL || DEFAULT_BASE_URL,
      SERVER_LLM_TYPE: process.env.SERVER_LLM_TYPE || DEFAULT_TYPE,
      SERVER_LLM_MODEL: process.env.SERVER_LLM_MODEL || '',
    });
  }
}

export function validateRuntimeConfig(config) {
  const errors = [];

  if (!config.apiKey?.trim()) errors.push('API key is required.');
  if (!config.baseUrl?.trim()) errors.push('Base URL is required.');
  if (!config.model?.trim()) errors.push('Model is required.');

  return errors;
}

export function getServerRuntimeConfig() {
  const config = getRuntimeConfig();
  return {
    type: DEFAULT_TYPE,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  };
}

function readRuntimeConfigFromDisk() {
  if (!existsSync(ENV_PATH)) {
    return {};
  }

  try {
    return parseEnvContent(readFileSync(ENV_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function parseEnvContent(content) {
  const values = {};

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = parseEnvValue(rawValue);
  });

  return values;
}

function parseEnvValue(value) {
  if (!value) return '';

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  return value;
}

function mergeManagedEnvBlock(currentFile, updates) {
  const preservedLines = currentFile
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (trimmed === '# LLM configuration') return false;
      return !MANAGED_KEYS.some((key) => trimmed.startsWith(`${key}=`));
    })
    .join('\n')
    .trimEnd();

  const managedBlock = buildManagedEnvBlock(updates);
  return preservedLines ? `${preservedLines}\n\n${managedBlock}` : managedBlock;
}

function buildManagedEnvBlock(values) {
  return [
    '# LLM configuration',
    `SERVER_LLM_API_KEY=${formatEnvValue(values.SERVER_LLM_API_KEY)}`,
    `SERVER_LLM_BASE_URL=${formatEnvValue(values.SERVER_LLM_BASE_URL)}`,
    `SERVER_LLM_TYPE=${formatEnvValue(values.SERVER_LLM_TYPE || DEFAULT_TYPE)}`,
    `SERVER_LLM_MODEL=${formatEnvValue(values.SERVER_LLM_MODEL)}`,
    '',
  ].join('\n');
}

function formatEnvValue(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';

  if (/[\s#"'\\]/.test(normalized)) {
    return JSON.stringify(normalized);
  }

  return normalized;
}

export { MANAGED_KEYS };
