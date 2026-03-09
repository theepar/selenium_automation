import { NextRequest } from 'next/server';
import { runAutomation } from '@/lib/automator';
import type { LogEvent, LogType } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const BLOCKED_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
const PRIVATE_IP_PATTERN = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;
const MAX_URL_LENGTH = 2048;
const MAX_CREDENTIAL_LENGTH = 256;

function validateTargetUrl(rawUrl: string): { valid: true; url: string } | { valid: false; error: string } {
    if (!rawUrl || typeof rawUrl !== 'string') return { valid: false, error: 'URL is required.' };
    if (rawUrl.length > MAX_URL_LENGTH) return { valid: false, error: 'URL exceeds maximum allowed length.' };

    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return { valid: false, error: 'URL is not valid. Make sure it starts with http:// or https://' };
    }

    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        return { valid: false, error: 'Only http and https URLs are allowed.' };
    }

    if (BLOCKED_HOSTNAMES.includes(parsed.hostname)) {
        return { valid: false, error: 'Targeting local or loopback addresses is not allowed.' };
    }

    if (PRIVATE_IP_PATTERN.test(parsed.hostname)) {
        return { valid: false, error: 'Targeting private network IP ranges is not allowed.' };
    }

    return { valid: true, url: parsed.href };
}

function sanitizeCredentials(credentials: unknown): { email?: string; password?: string } | undefined {
    if (!credentials || typeof credentials !== 'object') return undefined;
    const raw = credentials as Record<string, unknown>;

    const email = typeof raw.email === 'string' ? raw.email.slice(0, MAX_CREDENTIAL_LENGTH).trim() : undefined;
    const password = typeof raw.password === 'string' ? raw.password.slice(0, MAX_CREDENTIAL_LENGTH) : undefined;

    if (!email && !password) return undefined;
    return { email, password };
}

export async function POST(req: NextRequest) {
    let targetUrl: string;
    let credentials: { email?: string; password?: string } | undefined;

    try {
        const body = await req.json() as { url?: string; credentials?: unknown };
        const validation = validateTargetUrl(body.url?.trim() ?? '');

        if (!validation.valid) {
            return Response.json({ error: validation.error }, { status: 422 });
        }

        targetUrl = validation.url;
        credentials = sanitizeCredentials(body.credentials);
    } catch {
        return Response.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const enqueue = (event: LogEvent) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };

            const logger = (type: LogType, message: string, extra: Record<string, string> = {}): void => {
                enqueue({ type, message, timestamp: new Date().toISOString(), ...extra });
            };

            try {
                const result = await runAutomation(targetUrl, logger, credentials);
                enqueue({
                    type: 'done',
                    message: '✅ Automation complete.',
                    timestamp: new Date().toISOString(),
                    result,
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message.split('\n')[0] : String(error);
                enqueue({ type: 'error', message: `Fatal: ${errorMessage}`, timestamp: new Date().toISOString() });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
