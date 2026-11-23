import { NextResponse } from 'next/server';

const MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isValidHttpUrl(input: string): URL | null {
  const trimmed = input.trim();
  // Only treat as a URL if it looks like a single URL without spaces
  if (/\s/.test(trimmed)) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    // Require a valid-looking hostname with a dot (e.g., example.com)
    if (!parsed.hostname.includes('.')) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(html: string, attrName: string, attrValue: string): string {
  const escapedAttr = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex1 = new RegExp(
    `<meta[^>]*${attrName}=["']${escapedAttr}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i'
  );
  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*${attrName}=["']${escapedAttr}["'][^>]*>`,
    'i'
  );
  const match = html.match(regex1) || html.match(regex2);
  return match ? decodeHtmlEntities(match[1]) : '';
}

async function fetchPageContext(urlObj: URL): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(urlObj.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SchemaCraftAI/1.3; +https://schemacraft-ai-phi.vercel.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return null;
    }

    const html = await res.text();
    const cappedHtml = html.slice(0, 200_000);

    const titleMatch = cappedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
    const metaDesc =
      extractMetaContent(cappedHtml, 'name', 'description') ||
      extractMetaContent(cappedHtml, 'property', 'og:description');
    const ogTitle = extractMetaContent(cappedHtml, 'property', 'og:title');
    const ogSiteName = extractMetaContent(cappedHtml, 'property', 'og:site_name');
    const ogType = extractMetaContent(cappedHtml, 'property', 'og:type');

    const bodyMatch = cappedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const rawBody = bodyMatch ? bodyMatch[1] : cappedHtml;
    const strippedText = decodeHtmlEntities(
      rawBody
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    ).slice(0, 1000);

    const lines = [
      `Source URL: ${res.url || urlObj.toString()}`,
      title && `Page <title>: ${title}`,
      ogTitle && ogTitle !== title && `og:title: ${ogTitle}`,
      ogSiteName && `Site Name: ${ogSiteName}`,
      ogType && `og:type: ${ogType}`,
      metaDesc && `Meta Description: ${metaDesc}`,
      strippedText && `Page Text Excerpt: ${strippedText}`,
    ].filter(Boolean);

    return lines.length > 1 ? lines.join('\n') : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: Request) {
  try {
    const { prompt, schemaType } = await req.json();

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is missing in Vercel environment variables.' },
        { status: 500 }
      );
    }

    const trimmedPrompt = prompt.trim();
    const parsedUrl = isValidHttpUrl(trimmedPrompt);
    let pageContext: string | null = null;

    if (parsedUrl) {
      pageContext = await fetchPageContext(parsedUrl);
    }

    const isForcedType = schemaType && schemaType !== 'Auto-Detect';
    const typeInstruction = isForcedType
      ? `You MUST set the top-level "@type" to exactly "${schemaType}". Do NOT substitute another type like SoftwareApplication or WebSite.`
      : 'Automatically choose the single most appropriate valid Schema.org "@type" for the input.';

    const inputSection = pageContext
      ? `User entered URL: "${trimmedPrompt}"\nExtracted Webpage Metadata & Content:\n${pageContext}`
      : `User input: "${trimmedPrompt}"`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `You are an expert SEO engineer. Generate a complete, valid, Google Rich Results compliant JSON-LD object based on the following input.
${inputSection}

Rules:
1. Always include "@context": "https://schema.org".
2. ${typeInstruction}
3. Ground facts strictly in the provided input/metadata; never invent addresses, phone numbers, prices, or dates that aren't present.
4. Keep the JSON concise and complete—do not include bloated arrays or unnecessary nested filler.
5. Return ONLY a single valid JSON object.`,
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

    let lastStatus = 503;

    for (let sweep = 0; sweep < 2; sweep++) {
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
          continue;
        }

        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = rawText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        try {
          const parsed = JSON.parse(cleaned);
          if (isForcedType && parsed['@type'] !== schemaType) {
            parsed['@type'] = schemaType;
          }
          const formattedJson = JSON.stringify(parsed, null, 2);
          return NextResponse.json({
            schema: formattedJson,
            urlScanned: Boolean(pageContext),
          });
        } catch {
          lastStatus = 502;
          continue;
        }
      }

      if (sweep === 0) {
        await sleep(1000);
      }
    }

    return NextResponse.json(
      {
        error:
          'All AI endpoints are experiencing a brief traffic spike. Please click Generate Schema again in a few seconds.',
      },
      { status: lastStatus }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
