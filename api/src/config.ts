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

  // Render's requests arrive through two proxy hops in front of the app: an edge/CDN layer and
  // an internal load balancer, giving an X-Forwarded-For chain of
  // "<client>, <edge>, <internal-lb>". Trusting only one hop (the original assumption) made
  // Express read the internal load balancer's own address as req.ip instead of the client's,
  // and that address is not stable per client under concurrent connections - which is why the
  // rate limiter never triggered under a concurrent burst even though it worked for sequential
  // requests. Trusting two hops skips both proxies and reaches the real client address.
  // Confirmed against the deployed X-Forwarded-For chain; see DOCUMENTATION.md "What Went Wrong".
  trustProxyHops: 2,

  maxJsonBodyBytes: '10kb',
} as const;
