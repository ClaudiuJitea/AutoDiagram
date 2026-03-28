import { NextResponse } from 'next/server';
import { generateDiagramElements } from '@/lib/diagram-generator';

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
    if (!finalConfig.type || !finalConfig.apiKey) {
      return NextResponse.json(
        { error: 'Server-side LLM configuration is incomplete' },
        { status: 500 }
      );
    }

    const result = await generateDiagramElements(finalConfig, userInput, chartType);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating code:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate code' },
      { status: 500 }
    );
  }
}
