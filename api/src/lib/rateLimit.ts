import type { RequestHandler } from 'express';
import { config } from '../config.js';
import { ApiError } from './errors.js';

// Fixed-window limiter keyed on client IP, held in this process's memory. That is correct for the
// single instance this API runs as; running several instances would need a shared store (Redis
// or Postgres) so they count against one budget.
const windows = new Map<string, { count: number; resetAt: number }>();

// Drop expired windows once a minute so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [ip, window] of windows) if (window.resetAt <= now) windows.delete(ip);
}, config.rateLimit.windowMs).unref();

export const rateLimit: RequestHandler = (req, res, next) => {
  const { windowMs, maxRequestsPerWindow } = config.rateLimit;
  const ip = req.ip ?? 'unknown';
  const now = Date.now();

  let window = windows.get(ip);
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + windowMs };
    windows.set(ip, window);
  }
  window.count += 1;

  const secondsUntilReset = Math.ceil((window.resetAt - now) / 1000);
  res.setHeader('X-RateLimit-Limit', maxRequestsPerWindow);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequestsPerWindow - window.count));
  res.setHeader('X-RateLimit-Reset', secondsUntilReset);

  if (window.count > maxRequestsPerWindow) {
    res.setHeader('Retry-After', secondsUntilReset);
    return next(
      new ApiError(429, 'RATE_LIMITED', `Too many requests: limit is ${maxRequestsPerWindow} per ${windowMs / 1000}s. Retry after ${secondsUntilReset}s`),
    );
  }
  next();
};
