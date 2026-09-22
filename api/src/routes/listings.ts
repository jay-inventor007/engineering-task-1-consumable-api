import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { notFound } from '../lib/errors.js';
import { Conditions, listPage, pageParams, type ListSpec } from '../lib/list.js';
import { parseId, parseQuery } from '../lib/validate.js';

export const listingsSpec: ListSpec = {
  from: 'listings',
  columns: `id, agent_id as "agentId", title, description, listing_type as "listingType",
            property_type as "propertyType", status, price_minor as "priceMinor", currency,
            bedrooms, bathrooms, address, city, state, listed_at as "listedAt",
            created_at as "createdAt", updated_at as "updatedAt"`,
  sortFields: {
    listedAt: { column: 'listed_at', cast: 'timestamptz' },
    price: { column: 'price_minor', cast: 'bigint' },
    bedrooms: { column: 'bedrooms', cast: 'int' },
  },
  defaultSort: 'listedAt',
  defaultOrder: 'desc',
};

const money = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

// Filters shared by GET /listings and the nested GET /agents/:id/listings.
export const listingFilters = {
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  listingType: z.enum(['sale', 'rent']).optional(),
  propertyType: z.enum(['apartment', 'duplex', 'bungalow', 'terrace', 'land']).optional(),
  status: z.enum(['active', 'under_offer', 'sold', 'let']).optional(),
  minPrice: money.optional(),
  maxPrice: money.optional(),
  minBedrooms: z.coerce.number().int().min(0).optional(),
};

type ListingFilterValues = {
  agentId?: string;
  city?: string;
  state?: string;
  listingType?: string;
  propertyType?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
};

export function listingConditions(f: ListingFilterValues) {
  const c = new Conditions();
  if (f.agentId) c.add(`agent_id = ${c.param(f.agentId)}`);
  if (f.city) c.add(`lower(city) = lower(${c.param(f.city)})`);
  if (f.state) c.add(`lower(state) = lower(${c.param(f.state)})`);
  if (f.listingType) c.add(`listing_type = ${c.param(f.listingType)}`);
  if (f.propertyType) c.add(`property_type = ${c.param(f.propertyType)}`);
  if (f.status) c.add(`status = ${c.param(f.status)}`);
  if (f.minPrice !== undefined) c.add(`price_minor >= ${c.param(f.minPrice)}`);
  if (f.maxPrice !== undefined) c.add(`price_minor <= ${c.param(f.maxPrice)}`);
  if (f.minBedrooms !== undefined) c.add(`bedrooms >= ${c.param(f.minBedrooms)}`);
  return c;
}

export const priceRangeIsOrdered: [
  (q: { minPrice?: number; maxPrice?: number }) => boolean,
  { message: string; path: string[] },
] = [
  (q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice,
  { message: 'cannot be greater than maxPrice', path: ['minPrice'] },
];

const listQuery = z
  .strictObject({ ...pageParams(listingsSpec), ...listingFilters, agentId: z.uuid().optional() })
  .refine(...priceRangeIsOrdered);

export const listingsRouter = Router();

listingsRouter.get('/', async (req, res) => {
  const { limit, cursor, sort, order, offset: _, ...filters } = parseQuery(listQuery, req.query);
  res.json(await listPage(listingsSpec, { limit, cursor, sort, order }, filters, listingConditions(filters)));
});

listingsRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Listing');
  const { rows } = await pool.query(`select ${listingsSpec.columns} from listings where id = $1`, [id]);
  if (!rows[0]) throw notFound('Listing');
  res.json({ data: rows[0] });
});
