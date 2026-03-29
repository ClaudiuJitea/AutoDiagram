import { NextResponse } from 'next/server';
import {
  getRuntimeConfig,
  getRuntimeConfigStatus,
  persistRuntimeConfig,
  validateRuntimeConfig,
} from '@/lib/server/runtime-config';

export async function GET() {
  return NextResponse.json({
    config: getRuntimeConfig(),
    ...getRuntimeConfigStatus(),
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const nextConfig = {
      apiKey: body.apiKey || '',
      baseUrl: body.baseUrl || '',
      model: body.model || '',
    };

    const errors = validateRuntimeConfig(nextConfig);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
    }

    await persistRuntimeConfig(nextConfig);
    return NextResponse.json({ ok: true, config: getRuntimeConfig() });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update settings' }, { status: 500 });
  }
}
