import { NextResponse } from 'next/server';

const MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
];

export async function POST(req: Request) {
  try {
    const { prompt, schemaType } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is missing in Vercel environment variables.' },
        { status: 500 }
      );
    }

    const typeInstruction =
      schemaType && schemaType !== 'Auto-Detect'
        ? `You MUST use "@type": "${schemaType}" (or the most specific valid Schema.org subtype of ${schemaType}) as the primary schema entity.`
        : 'Automatically choose the most appropriate valid Schema.org "@type" for the input.';

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `You are an expert SEO engineer. Generate valid, Google Rich Results compliant JSON-LD schema markup for the following business, product, page, or URL: "${prompt}". ${typeInstruction} Return ONLY raw JSON without markdown code fences or extra commentary.`,
            },
          ],
        },
      ],
    };

    let data: any = null;
    let lastError = 'Gemini API error occurred';
    let lastStatus = 500;

    for (let i = 0; i < MODELS.length; i++) {
      const model = MODELS[i];
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      data = await response.json();

      if (response.ok) {
        break;
      }

      lastStatus = response.status;
      lastError = data?.error?.message || 'Gemini API error occurred';

      const isTransientLoad =
        response.status === 503 ||
        response.status === 429 ||
        /high demand|overloaded|unavailable/i.test(lastError);

      if (!isTransientLoad || i === MODELS.length - 1) {
        return NextResponse.json({ error: lastError }, { status: lastStatus });
      }
    }

    const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      return NextResponse.json(
        {
          error:
            'Gemini returned an empty response. Try a more descriptive text prompt instead of a bare URL.',
        },
        { status: 500 }
      );
    }

    const cleanedSchema = generatedText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    return NextResponse.json({ schema: cleanedSchema });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
