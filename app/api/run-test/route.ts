import { NextRequest } from 'next/server';
import { runAutomation } from '@/lib/automator';
import type { LogEvent, LogType } from '@/types';

// Next.js 15 App Router — server-side only, Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    let url: string | undefined;

    try {
        const body = await req.json() as { url?: string };
        url = body.url?.trim();
    } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!url) {
        return Response.json({ error: 'URL diperlukan' }, { status: 400 });
    }

    // ─── Server-Sent Events stream ─────────────────────────────────────────────
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
                const result = await runAutomation(url!, logger);
                enqueue({
                    type: 'done',
                    message: '✅ Automation selesai',
                    timestamp: new Date().toISOString(),
                    result,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
                enqueue({ type: 'error', message: `💥 Fatal: ${msg}`, timestamp: new Date().toISOString() });
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
        },
    });
}
