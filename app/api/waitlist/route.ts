import { NextResponse } from 'next/server';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const source = typeof body?.source === 'string' ? body.source.trim() : 'pricing_card';

    if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    // Optional webhook forward (e.g., Formspree, Make, Zapier, or Slack webhook in Vercel env vars)
    const webhookUrl = process.env.WAITLIST_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: rawEmail,
            source,
            product: 'SchemaCraft AI Pro',
            createdAt: new Date().toISOString(),
          }),
        });
      } catch {
        // Don't fail user signup if an external webhook times out
      }
    }

    // Structured log visible in Vercel Functions / Runtime Logs
    console.log(
      JSON.stringify({
        event: 'SCHEMACRAFT_PRO_WAITLIST',
        email: rawEmail,
        source,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      ok: true,
      message: "You're on the SchemaCraft AI Pro early-access list.",
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to process waitlist request right now.' },
      { status: 500 }
    );
  }
}
