import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { errorHandler, unknownRoute } from './lib/errors.js';
import { rateLimit } from './lib/rateLimit.js';
import { agenciesRouter } from './routes/agencies.js';
import { agentsRouter } from './routes/agents.js';
import { listingsRouter } from './routes/listings.js';
import { viewingsRouter } from './routes/viewings.js';

export const app = express();

app.set('trust proxy', config.trustProxyHops);
app.disable('x-powered-by');

// Public API: any origin may call it, which is what lets the consumer page run from anywhere.
app.use(cors({ methods: ['GET', 'POST', 'PATCH', 'DELETE'], exposedHeaders: ['Retry-After', 'Location', 'X-RateLimit-Remaining'] }));
app.use(rateLimit);
app.use(express.json({ limit: config.maxJsonBodyBytes }));

const v1 = express.Router();
v1.use('/agencies', agenciesRouter);
v1.use('/agents', agentsRouter);
v1.use('/listings', listingsRouter);
v1.use('/viewings', viewingsRouter);
app.use('/api/v1', v1);

app.use(unknownRoute);
app.use(errorHandler);
