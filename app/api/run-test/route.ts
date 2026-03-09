import { NextRequest } from "next/server";
import { runAutomation } from "@/lib/automator";
import type { LogEvent, LogType, FlowType } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Security constants ───────────────────────────────────────────────────────
const ALLOWED_PROTOCOLS = ["http:", "https:"];
const BLOCKED_HOSTNAMES = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
const PRIVATE_IP_PATTERN =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;
const MAX_URL_LENGTH = 2_048;
const MAX_CREDENTIAL_LENGTH = 256;
const MAX_POST_CONTENT_LENGTH = 2_000;
const VALID_FLOWS: FlowType[] = ["login", "register", "postFeed"];

// ─── Validators ───────────────────────────────────────────────────────────────

function validateTargetUrl(
  rawUrl: string,
): { valid: true; url: string } | { valid: false; error: string } {
  if (!rawUrl || typeof rawUrl !== "string")
    return { valid: false, error: "URL is required." };
  if (rawUrl.length > MAX_URL_LENGTH)
    return { valid: false, error: "URL exceeds maximum allowed length." };

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      valid: false,
      error: "URL is not valid. Make sure it starts with http:// or https://",
    };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol))
    return { valid: false, error: "Only http and https URLs are allowed." };

  if (BLOCKED_HOSTNAMES.includes(parsed.hostname))
    return {
      valid: false,
      error: "Targeting local or loopback addresses is not allowed.",
    };

  if (PRIVATE_IP_PATTERN.test(parsed.hostname))
    return {
      valid: false,
      error: "Targeting private network IP ranges is not allowed.",
    };

  return { valid: true, url: parsed.href };
}

function validateFlow(
  flow: unknown,
): { valid: true; flow: FlowType } | { valid: false; error: string } {
  if (!flow || typeof flow !== "string")
    return {
      valid: false,
      error: 'Flow is required. Must be "login", "register", or "postFeed".',
    };
  if (!VALID_FLOWS.includes(flow as FlowType))
    return {
      valid: false,
      error: `Invalid flow "${flow}". Must be one of: ${VALID_FLOWS.join(", ")}.`,
    };
  return { valid: true, flow: flow as FlowType };
}

function sanitizeCredentials(
  credentials: unknown,
): { email?: string; password?: string } | undefined {
  if (!credentials || typeof credentials !== "object") return undefined;
  const raw = credentials as Record<string, unknown>;

  const email =
    typeof raw.email === "string"
      ? raw.email.slice(0, MAX_CREDENTIAL_LENGTH).trim()
      : undefined;
  const password =
    typeof raw.password === "string"
      ? raw.password.slice(0, MAX_CREDENTIAL_LENGTH)
      : undefined;

  if (!email && !password) return undefined;
  return { email, password };
}

function sanitizePostContent(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_POST_CONTENT_LENGTH);
  return trimmed || undefined;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let targetUrl: string;
  let flow: FlowType;
  let credentials: { email?: string; password?: string } | undefined;
  let postContent: string | undefined;

  // ── Parse & validate body ──────────────────────────────────────────────────
  try {
    const body = (await req.json()) as {
      url?: string;
      flow?: unknown;
      credentials?: unknown;
      postContent?: unknown;
    };

    // URL
    const urlValidation = validateTargetUrl(body.url?.trim() ?? "");
    if (!urlValidation.valid)
      return Response.json({ error: urlValidation.error }, { status: 422 });
    targetUrl = urlValidation.url;

    // Flow
    const flowValidation = validateFlow(body.flow);
    if (!flowValidation.valid)
      return Response.json({ error: flowValidation.error }, { status: 422 });
    flow = flowValidation.flow;

    // Credentials (required for login / postFeed)
    credentials = sanitizeCredentials(body.credentials);
    if (
      (flow === "login" || flow === "postFeed") &&
      (!credentials?.email || !credentials?.password)
    ) {
      return Response.json(
        {
          error: `Flow "${flow}" requires both email and password credentials.`,
        },
        { status: 422 },
      );
    }

    // Post content (optional — automator supplies a default if absent)
    postContent = sanitizePostContent(body.postContent);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // ── Stream SSE back to the client ──────────────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: LogEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      const logger = (
        type: LogType,
        message: string,
        extra: Record<string, string> = {},
      ): void => {
        enqueue({
          type,
          message,
          timestamp: new Date().toISOString(),
          ...extra,
        });
      };

      try {
        const result = await runAutomation(
          targetUrl,
          flow,
          logger,
          credentials,
          postContent,
        );

        enqueue({
          type: "done",
          message: "✅ Automation complete.",
          timestamp: new Date().toISOString(),
          result,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message.split("\n")[0] : String(error);
        enqueue({
          type: "error",
          message: `Fatal: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
