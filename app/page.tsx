'use client';

import React, { useEffect, useState } from 'react';

const DAILY_LIMIT = 5;
const STORAGE_KEY = 'sc_daily_remaining';

const SCHEMA_TYPES = [
  'Auto-Detect',
  'LocalBusiness',
  'Product',
  'Organization',
  'Article',
  'Service',
  'Event',
] as const;

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SchemaCraftPage() {
  const [input, setInput] = useState('');
  const [schemaType, setSchemaType] = useState<string>('Auto-Detect');
  const [generatedSchema, setGeneratedSchema] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remainingFree, setRemainingFree] = useState<number>(DAILY_LIMIT);
  const [copiedMode, setCopiedMode] = useState<'json' | 'script' | null>(null);
  const [activeGuide, setActiveGuide] = useState<'wordpress' | 'shopify' | 'webflow'>('wordpress');

  // Waitlist state
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSource, setWaitlistSource] = useState<'pricing_card' | 'daily_limit_banner'>('pricing_card');
  const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [waitlistMessage, setWaitlistMessage] = useState('');

  useEffect(() => {
    const today = getTodayUTC();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.date === today && typeof parsed.remaining === 'number') {
          setRemainingFree(Math.max(0, Math.min(DAILY_LIMIT, parsed.remaining)));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  function persistRemaining(value: number) {
    const clamped = Math.max(0, Math.min(DAILY_LIMIT, value));
    setRemainingFree(clamped);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ date: getTodayUTC(), remaining: clamped })
      );
    } catch {
      // Ignore storage errors
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    setError('');
    setCopiedMode(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ input: input.trim(), schemaType }),
      });

      const data = await res.json();

      if (typeof data.remainingFree === 'number') {
        persistRemaining(data.remainingFree);
      }

      if (!res.ok) {
        setError(data.error || 'Could not generate schema. Please try again.');
        return;
      }

      setGeneratedSchema(data.schema || '');
    } catch {
      setError('Network error while generating schema. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(mode: 'json' | 'script') {
    if (!generatedSchema) return;
    const textToCopy =
      mode === 'script'
        ? `<script type="application/ld+json">\n${generatedSchema}\n</script>`
        : generatedSchema;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedMode(mode);
      setTimeout(() => setCopiedMode(null), 2500);
    } catch {
      setError('Unable to copy to clipboard. Please copy manually.');
    }
  }

  async function handleWaitlistSubmit(e: React.FormEvent, source: 'pricing_card' | 'daily_limit_banner') {
    e.preventDefault();
    if (!waitlistEmail.trim() || waitlistStatus === 'submitting') return;

    setWaitlistSource(source);
    setWaitlistStatus('submitting');
    setWaitlistMessage('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: waitlistEmail.trim(), source }),
      });
      const data = await res.json();

      if (!res.ok) {
        setWaitlistStatus('error');
        setWaitlistMessage(data.error || 'Could not join waitlist. Please check your email.');
        return;
      }

      setWaitlistStatus('success');
      setWaitlistMessage(data.message || "You're on the SchemaCraft AI Pro early-access list!");
      setWaitlistEmail('');
    } catch {
      setWaitlistStatus('error');
      setWaitlistMessage('Network error submitting email. Please try again.');
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Bar */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 font-mono text-sm font-bold text-emerald-400">
              {'{}'}
            </span>
            <span className="text-lg font-semibold tracking-tight">SchemaCraft AI</span>
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-200">
            Starter Plan:{' '}
            <span className={remainingFree === 0 ? 'font-bold text-amber-400' : 'font-bold text-emerald-400'}>
              {remainingFree}/{DAILY_LIMIT}
            </span>{' '}
            free schemas left today
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Hero */}
        <section className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Google Rich Results JSON-LD in Seconds
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
            Paste any webpage URL or plain-English business description to generate clean, validated
            Schema.org structured data ready for WordPress, Shopify, or Webflow.
          </p>
        </section>

        {/* Daily Limit Banner */}
        {remainingFree === 0 && (
          <section className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-base font-semibold text-amber-300">
                  You&apos;ve used all 5/5 free schemas for today
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  Your free quota resets automatically tomorrow, or join the Pro waitlist ($12/mo) for
                  unlimited daily generations.
                </p>
              </div>
              <form
                onSubmit={(e) => handleWaitlistSubmit(e, 'daily_limit_banner')}
                className="flex w-full max-w-md gap-2"
              >
                <input
                  type="email"
                  required
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={waitlistStatus === 'submitting'}
                  className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  Join Pro Waitlist
                </button>
              </form>
            </div>
            {waitlistMessage && waitlistSource === 'daily_limit_banner' && (
              <p
                className={`mt-2 text-xs ${
                  waitlistStatus === 'success' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {waitlistMessage}
              </p>
            )}
          </section>
        )}

        {/* Generator Card */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="md:col-span-3">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Website URL or Business / Page Description
                </label>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="https://example.com or describe your business, hours, address, and services..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Schema Type
                </label>
                <select
                  value={schemaType}
                  onChange={(e) => setSchemaType(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white focus:border-emerald-400 focus:outline-none"
                >
                  {SCHEMA_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-400">
                Supports live URL metadata scraping &amp; strict JSON-LD validation.
              </span>
              <button
                type="submit"
                disabled={loading || !input.trim() || remainingFree === 0}
                className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? 'Generating Schema...'
                  : remainingFree === 0
                  ? 'Daily Limit Reached (0/5)'
                  : 'Generate JSON-LD Schema'}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {/* Output Panel */}
          {generatedSchema && (
            <div className="mt-6 border-t border-slate-800 pt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Validated JSON-LD Output
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy('json')}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    {copiedMode === 'json' ? 'Copied Raw JSON!' : 'Copy JSON'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy('script')}
                    className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
                  >
                    {copiedMode === 'script'
                      ? 'Copied <script> Tag!'
                      : 'Copy with <script> Tag'}
                  </button>
                  <a
                    href="https://search.google.com/test/rich-results"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500"
                  >
                    Test in Google Rich Results ↗
                  </a>
                </div>
              </div>

              <pre className="max-h-96 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-300">
                {`<script type="application/ld+json">\n${generatedSchema}\n</script>`}
              </pre>

              {/* Platform Guides */}
              <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Where to Paste This Code
                  </span>
                  <div className="flex gap-1.5">
                    {(['wordpress', 'shopify', 'webflow'] as const).map((platform) => (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => setActiveGuide(platform)}
                        className={`rounded-lg px-3 py-1 text-xs font-medium capitalize ${
                          activeGuide === platform
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {platform}
                      </button>
                    ))}
                  </div>
                </div>

                {activeGuide === 'wordpress' && (
                  <p className="text-xs leading-relaxed text-slate-400">
                    <strong className="text-slate-200">WordPress:</strong> Edit the target page in the
                    Block Editor, add a <strong className="text-slate-200">Custom HTML</strong> block,
                    paste the full <code className="text-emerald-400">&lt;script&gt;</code> snippet,
                    and click Update. For site-wide schema, paste it into your header/footer plugin
                    (such as WPCode).
                  </p>
                )}
                {activeGuide === 'shopify' && (
                  <p className="text-xs leading-relaxed text-slate-400">
                    <strong className="text-slate-200">Shopify:</strong> Go to{' '}
                    <strong className="text-slate-200">Online Store → Themes → Edit code</strong>, open{' '}
                    <code className="text-emerald-400">theme.liquid</code> (or your specific product/page
                    template), paste the <code className="text-emerald-400">&lt;script&gt;</code> tag
                    right before <code className="text-emerald-400">&lt;/head&gt;</code>, and click Save.
                  </p>
                )}
                {activeGuide === 'webflow' && (
                  <p className="text-xs leading-relaxed text-slate-400">
                    <strong className="text-slate-200">Webflow:</strong> Open{' '}
                    <strong className="text-slate-200">Pages → Page Settings</strong> for the page you
                    want to mark up, scroll to <strong className="text-slate-200">Custom Code → Inside &lt;head&gt; tag</strong>,
                    paste the <code className="text-emerald-400">&lt;script&gt;</code> snippet, Save, and
                    Publish.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Pricing & Pro Waitlist */}
        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h3 className="text-lg font-semibold">Starter</h3>
            <p className="mt-1 text-2xl font-bold">
              $0 <span className="text-sm font-normal text-slate-400">/ month</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>• 5 validated JSON-LD generations per day</li>
              <li>• Live URL metadata extraction</li>
              <li>• One-click &lt;script&gt; copy &amp; CMS guides</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-emerald-500/40 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-emerald-400">Pro (Early Access)</h3>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Waitlist Open
              </span>
            </div>
            <p className="mt-1 text-2xl font-bold">
              $12 <span className="text-sm font-normal text-slate-400">/ month</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>• Unlimited daily schema generations</li>
              <li>• Multi-page &amp; client site workflows</li>
              <li>• Priority schema templates (FAQ, Review, Menu)</li>
            </ul>

            <form
              onSubmit={(e) => handleWaitlistSubmit(e, 'pricing_card')}
              className="mt-5 flex gap-2"
            >
              <input
                type="email"
                required
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                placeholder="Enter your email for Pro access"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={waitlistStatus === 'submitting'}
                className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                Join Waitlist
              </button>
            </form>
            {waitlistMessage && waitlistSource === 'pricing_card' && (
              <p
                className={`mt-2 text-xs ${
                  waitlistStatus === 'success' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {waitlistMessage}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
