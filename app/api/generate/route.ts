import { NextRequest, NextResponse } from 'next/server';

const DAILY_LIMIT = 5;
const COOKIE_NAME = 'sc_daily_usage';
const MODELS = ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function readDailyCount(request: NextRequest, today: string): number {
  try {
    const raw = request.cookies.get(COOKIE_NAME)?.value;
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (parsed.date === today && typeof parsed.count === 'number' && parsed.count >= 0) {
      return parsed.count;
    }
  } catch {
    // Ignore malformed cookie and reset to 0
  }
  return 0;
}

function attachUsageCookie(response: NextResponse, today: string, count: number): NextResponse {
  response.cookies.set({
    name: COOKIE_NAME,
    value: JSON.stringify({ date: today, count }),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return response;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function scrapeUrlMetadata(targetUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'SchemaCraftAI-Bot/1.0 (+https://schema.org)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      return `URL provided: ${targetUrl} (HTTP ${res.status})`;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return `URL provided: ${targetUrl}`;
    }

    const rawHtml = (await res.text()).slice(0, 200_000);

    const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descMatch =
      rawHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ||
      rawHtml.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i);
    const ogTitleMatch =
      rawHtml.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ||
      rawHtml.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:title["'][^>]*>/i);
    const ogSiteMatch =
      rawHtml.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ||
      rawHtml.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:site_name["'][^>]*>/i);
    const ogTypeMatch =
      rawHtml.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ||
      rawHtml.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:type["'][^>]*>/i);

    const strippedBody = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);

    return [
      `Target URL: ${targetUrl}`,
      titleMatch?.[1] ? `Page Title: ${titleMatch[1].trim()}` : '',
      ogTitleMatch?.[1] ? `OG Title: ${ogTitleMatch[1].trim()}` : '',
      ogSiteMatch?.[1] ? `Site Name: ${ogSiteMatch[1].trim()}` : '',
      ogTypeMatch?.[1] ? `OG Type: ${ogTypeMatch[1].trim()}` : '',
      descMatch?.[1] ? `Meta Description: ${descMatch[1].trim()}` : '',
      strippedBody ? `Page Text Excerpt: ${strippedBody}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  } catch {
    return `Target URL: ${targetUrl} (Metadata fetch timed out or blocked; infer from URL and context.)`;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiWithFallback(prompt: string, apiKey: string): Promise<string> {
  let lastError = 'All Gemini models failed.';

  for (let sweep = 0; sweep < 2; sweep++) {
    for (const model of MODELS) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          lastError = `${model} (${res.status}): ${errText.slice(0, 200)}`;
          continue;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && typeof text === 'string') {
          return text;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (sweep === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(lastError);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server configuration error: GEMINI_API_KEY is missing.' },
      { status: 500 }
    );
  }

  const today = getTodayUTC();
  const currentCount = readDailyCount(request, today);

  if (currentCount >= DAILY_LIMIT) {
    const blockedRes = NextResponse.json(
      {
        error: 'You have used all 5 free schemas for today. Join the Pro waitlist for unlimited access.',
        remainingFree: 0,
      },
      { status: 429 }
    );
    return attachUsageCookie(blockedRes, today, currentCount);
  }

  let body: { input?: string; schemaType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const rawInput = (body.input || '').trim();
  const schemaType = (body.schemaType || 'Auto-Detect').trim();

  if (!rawInput) {
    return NextResponse.json(
      { error: 'Please enter a website URL or business description.' },
      { status: 400 }
    );
  }

  const contextBlock = isValidHttpUrl(rawInput)
    ? await scrapeUrlMetadata(rawInput)
    : `User Description:\n${rawInput}`;

  const typeInstruction =
    schemaType === 'Auto-Detect'
      ? 'Choose the most accurate Google Rich Results Schema.org @type (e.g., LocalBusiness, Restaurant, Product, Organization, Article, Service, Event).'
      : `You MUST use "@type": "${schemaType}".`;

  const prompt = `You are an expert technical SEO engineer specializing in Google Rich Results JSON-LD structured data.
Generate valid, clean, production-ready Schema.org JSON-LD based ONLY on the facts provided below. Do not invent fake reviews, ratings, prices, or false claims. Omit unknown optional fields rather than fabricating them.

Rules:
1. Output ONLY raw valid JSON (no markdown code fences, no commentary).
2. Always include "@context": "https://schema.org".
3. ${typeInstruction}
4. Use clean Google-recommended properties (name, url, description, address, telephone, openingHoursSpecification, areaServed, offers, etc., when supported by the input).

Input Context:
${contextBlock}`;

  try {
    const rawOutput = await callGeminiWithFallback(prompt, apiKey);
    const cleaned = rawOutput
      .replace(/^```(?:json|jsonld)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!parsed['@context']) {
      parsed['@context'] = 'https://schema.org';
    }
    if (schemaType !== 'Auto-Detect') {
      parsed['@type'] = schemaType;
    }

    const formattedJson = JSON.stringify(parsed, null, 2);
    const newCount = currentCount + 1;
    const remainingFree = Math.max(0, DAILY_LIMIT - newCount);

    const successRes = NextResponse.json({
      schema: formattedJson,
      remainingFree,
    });

    return attachUsageCookie(successRes, today, newCount);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate valid JSON-LD.';
    return NextResponse.json(
      {
        error: `Generation failed: ${message}`,
        remainingFree: Math.max(0, DAILY_LIMIT - currentCount),
      },
      { status: 502 }
    );
  }
}
