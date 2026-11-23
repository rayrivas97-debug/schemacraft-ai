import { NextResponse } from 'next/server';

const MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
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

    const isForcedType = schemaType && schemaType !== 'Auto-Detect';
    const typeInstruction = isForcedType
      ? `You MUST set the top-level "@type" to exactly "${schemaType}". Do NOT substitute another type like SoftwareApplication or WebSite.`
      : 'Automatically choose the single most appropriate valid Schema.org "@type" for the input.';

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `You are an expert SEO engineer. Generate a complete, valid, Google Rich Results compliant JSON-LD object for: "${prompt}".
Rules:
1. Always include "@context": "https://schema.org".
2. ${typeInstruction}
3. Keep the JSON concise and complete—do not include bloated arrays or unnecessary nested filler.
4. Return ONLY a single valid JSON object.`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 2048,
        temperature: 0.2,
      },
    };

    let lastError = 'Unable to generate valid schema right now. Please try again.';
    let lastStatus = 500;

    for (let i = 0; i < MODELS.length; i++) {
      const model = MODELS[i];
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        lastStatus = response.status;
        lastError = data?.error?.message || `Model ${model} failed`;
        continue; // Immediately try the next model in MODELS
      }

      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      try {
        // Verify JSON is 100% syntactically complete and not truncated
        const parsed = JSON.parse(cleaned);
        if (isForcedType && parsed['@type'] !== schemaType) {
          parsed['@type'] = schemaType;
        }
        const formattedJson = JSON.stringify(parsed, null, 2);
        return NextResponse.json({ schema: formattedJson });
      } catch {
        // If output was truncated or malformed JSON, fall over to the next model
        lastError = 'Generated JSON was incomplete. Retrying on backup model failed.';
        lastStatus = 502;
        continue;
      }
    }

    return NextResponse.json({ error: lastError }, { status: lastStatus });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
