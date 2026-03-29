import { NextResponse } from 'next/server';
import { generateDiagramElements } from '@/lib/diagram-generator';
import { getRuntimeConfigStatus } from '@/lib/server/runtime-config';

/**
 * POST /api/generate
 * Generate Excalidraw code based on user input
 */
export async function POST(request) {
  try {
    const { userInput, chartType } = await request.json();
    if (!userInput) {
      return NextResponse.json(
        { error: 'Missing required parameter: userInput' },
        { status: 400 }
      );
    }

    const finalConfig = {
      type: process.env.SERVER_LLM_TYPE,
      baseUrl: process.env.SERVER_LLM_BASE_URL,
      apiKey: process.env.SERVER_LLM_API_KEY,
      model: process.env.SERVER_LLM_MODEL,
    };
    const runtimeStatus = getRuntimeConfigStatus();
    if (!finalConfig.type || !runtimeStatus.configured) {
      return NextResponse.json(
        {
          error: 'LLM configuration is incomplete. Add an API key and model in Settings before generating.',
          code: 'llm_not_configured',
          missingFields: runtimeStatus.missingFields,
        },
        { status: 503 }
      );
    }

    const result = await generateDiagramElements(finalConfig, userInput, chartType || 'flowchart');
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating code:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate code' },
      { status: 500 }
    );
  }
}
