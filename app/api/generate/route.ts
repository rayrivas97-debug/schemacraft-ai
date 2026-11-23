import { NextResponse } from 'next/server';

const MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
];

const DAILY_FREE_LIMIT = 5;
const USAGE_COOKIE_NAME = 'sc_daily_usage';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getUtcDayKey(): string {
  return new Date().toISOString().slice(0, 10); // e.g., "2026-11-23"
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      acc[key] = decodeURIComponent(val);
    }
    return acc;
  }, {});
}

function readDailyUsage(req: Request): { day: string; count: number } {
  const today = getUtcDayKey();
  const cookies = parseCookieHeader(req.headers.get('cookie'));
  const raw = cookies[USAGE_COOKIE_NAME];

  if (!raw) return { day: today, count: 0 };

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.day === today && typeof parsed?.count === 'number') {
      return { day: today, count: Math.max(0, parsed.count) };
    }
  } catch {
    // Ignore malformed cookie and start fresh for today
  }

  return { day: today, count: 0 };
}

function attachUsageCookie(res: NextResponse, day: string, count: number): NextResponse {
  const payload = encodeURIComponent(JSON.stringify({ day, count }));
  res.cookies.set(USAGE_COOKIE_NAME, payload, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 48, // 48 hours
  });
  return res;
}

function isValidHttpUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (/\s/.test(trimmed)) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
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
          'Mozilla/5.0 (compatible; SchemaCraftAI/1.4; +https://schemacraft-ai-phi.vercel.app)',
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
    const usage = readDailyUsage(req);

    if (usage.count >= DAILY_FREE_LIMIT) {
      const limitRes = NextResponse.json(
        {
          error: `You've used all ${DAILY_FREE_LIMIT} free schema generations for today. Upgrade to Pro for unlimited generations.`,
          limitReached: true,
          remainingFree: 0,
          dailyLimit: DAILY_FREE_LIMIT,
        },
        { status: 429 }
      );
      return attachUsageCookie(limitRes, usage.day, usage.count);
    }

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
          const nextCount = usage.count + 1;
          const remainingFree = Math.max(0, DAILY_FREE_LIMIT - nextCount);

          const successRes = NextResponse.json({
            schema: formattedJson,
            urlScanned: Boolean(pageContext),
            remainingFree,
            dailyLimit: DAILY_FREE_LIMIT,
          });
          return attachUsageCookie(successRes, usage.day, nextCount);
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
