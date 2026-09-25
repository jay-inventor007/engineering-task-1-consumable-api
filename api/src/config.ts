// Every tunable number the API depends on lives here, not inside handlers, so changing a limit
// is a one-line diff reviewed in one place.

export const config = {
  port: Number(process.env.PORT ?? 3000),

  pagination: {
    defaultLimit: 20,
    // Requests above this are clamped down to it, not rejected and not honoured.
    maxLimit: 100,
  },

  rateLimit: {
    windowMs: 60_000,
    maxRequestsPerWindow: 100,
  },

  // Confirmed against the live deployment's X-Forwarded-For header, which arrives as
  // "<client>, <cloudflare-edge>, <render-internal-lb>" - three entries, so three hops must be
  // trusted to reach the real client address at the left end. Getting this number wrong doesn't
  // fail loudly: with trustProxyHops=1, req.ip resolved to the internal load balancer's own
  // address, which is not stable per client under concurrent connections, so the per-IP rate
  // limiter never triggered under a concurrent burst even though it worked for sequential
  // requests. See DOCUMENTATION.md "What Went Wrong" for how this was diagnosed.
  trustProxyHops: 3,

  maxJsonBodyBytes: '10kb',
} as const;
