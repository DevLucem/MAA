import type { NextRequest } from "next/server";

const DEFAULT_HERMES_BASE_URL =
  process.env.HERMES_API_URL || "http://127.0.0.1:8642";

function resolveBaseUrl(headerValue: string | null): string {
  const candidate = (headerValue || DEFAULT_HERMES_BASE_URL).trim();
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return DEFAULT_HERMES_BASE_URL;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    return DEFAULT_HERMES_BASE_URL;
  }
}

async function proxyToHermes(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await context.params;
  const baseUrl = resolveBaseUrl(request.headers.get("x-hermes-base-url"));
  const joinedPath = Array.isArray(path) ? path.join("/") : "";
  const search = request.nextUrl.search || "";
  const targetUrl = `${baseUrl}/${joinedPath}${search}`;

  const upstreamHeaders = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    upstreamHeaders.set("Content-Type", contentType);
  }
  const accept = request.headers.get("accept");
  if (accept) {
    upstreamHeaders.set("Accept", accept);
  }

  const incomingAuth = request.headers.get("authorization");
  const explicitKey =
    request.headers.get("x-hermes-api-key") ||
    process.env.HERMES_API_KEY ||
    process.env.API_SERVER_KEY ||
    "";

  if (incomingAuth) {
    upstreamHeaders.set("Authorization", incomingAuth);
  } else if (explicitKey) {
    upstreamHeaders.set("Authorization", `Bearer ${explicitKey}`);
  }

  const sessionKey = request.headers.get("x-hermes-session-key");
  if (sessionKey) {
    upstreamHeaders.set("X-Hermes-Session-Key", sessionKey);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const bodyBuffer = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method,
      headers: upstreamHeaders,
      body:
        hasBody && bodyBuffer && bodyBuffer.byteLength > 0
          ? bodyBuffer
          : undefined,
      signal: request.signal,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const upstreamContentType = upstreamResponse.headers.get("content-type");
    if (upstreamContentType) {
      responseHeaders.set("Content-Type", upstreamContentType);
    }
    const cacheControl = upstreamResponse.headers.get("cache-control");
    if (cacheControl) {
      responseHeaders.set("Cache-Control", cacheControl);
    } else {
      responseHeaders.set("Cache-Control", "no-cache, no-transform");
    }

    const returnedRunId =
      upstreamResponse.headers.get("x-hermes-run-id") ||
      upstreamResponse.headers.get("x-run-id");
    if (returnedRunId) {
      responseHeaders.set("X-Hermes-Run-Id", returnedRunId);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect to Hermes";
    return Response.json(
      {
        error: {
          message: `Cannot reach Hermes API Server at ${baseUrl} (${message}). Ensure API_SERVER_ENABLED=true is set in ~/.hermes/.env and run "hermes gateway".`,
          code: "HERMES_UNREACHABLE",
          targetUrl,
        },
      },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyToHermes(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyToHermes(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyToHermes(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyToHermes(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyToHermes(request, context);
}
