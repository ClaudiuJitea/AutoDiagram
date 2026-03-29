import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env.local');

const MANAGED_KEYS = [
  'SERVER_LLM_API_KEY',
  'SERVER_LLM_BASE_URL',
  'SERVER_LLM_MODEL',
];

export function getRuntimeConfig() {
  return {
    apiKey: process.env.SERVER_LLM_API_KEY || '',
    baseUrl: process.env.SERVER_LLM_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.SERVER_LLM_MODEL || '',
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
    SERVER_LLM_API_KEY: nextConfig.apiKey,
    SERVER_LLM_BASE_URL: nextConfig.baseUrl,
    SERVER_LLM_MODEL: nextConfig.model,
  };

  let content = currentFile;
  for (const [key, value] of Object.entries(updates)) {
    const normalized = String(value ?? '').trim();
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(content)) {
      content = content.replace(pattern, `${key}=${normalized}`);
    } else {
      content = `${content.trimEnd()}\n${key}=${normalized}\n`;
    }
    process.env[key] = normalized;
  }

  await writeFile(ENV_PATH, content, 'utf8');
}

async function readEnvFile() {
  try {
    return await readFile(ENV_PATH, 'utf8');
  } catch {
    const defaults = [
      '# LLM configuration',
      `SERVER_LLM_API_KEY=${process.env.SERVER_LLM_API_KEY || ''}`,
      `SERVER_LLM_BASE_URL=${process.env.SERVER_LLM_BASE_URL || 'https://openrouter.ai/api/v1'}`,
      'SERVER_LLM_TYPE=openrouter',
      `SERVER_LLM_MODEL=${process.env.SERVER_LLM_MODEL || ''}`,
    ];
    return `${defaults.join('\n')}`;
  }
}

export function validateRuntimeConfig(config) {
  const errors = [];

  if (!config.apiKey?.trim()) errors.push('API key is required.');
  if (!config.baseUrl?.trim()) errors.push('Base URL is required.');
  if (!config.model?.trim()) errors.push('Model is required.');

  return errors;
}

export { MANAGED_KEYS };
