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

  // Render terminates TLS at one proxy hop in front of the app. Trusting exactly one hop makes
  // req.ip the real client address, which is what the rate limiter keys on.
  trustProxyHops: 1,

  maxJsonBodyBytes: '10kb',
} as const;
