import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { notFound } from '../lib/errors.js';
import { Conditions, listPage, pageParams, type ListSpec } from '../lib/list.js';
import { parseId, parseQuery } from '../lib/validate.js';
import { likePattern } from '../lib/sql.js';
import { listingConditions, listingFilters, listingsSpec, priceRangeIsOrdered } from './listings.js';

export const agentsSpec: ListSpec = {
  from: 'agents',
  columns: `id, agency_id as "agencyId", full_name as "fullName", email, phone,
            years_experience as "yearsExperience", created_at as "createdAt", updated_at as "updatedAt"`,
  sortFields: {
    fullName: { column: 'full_name', cast: 'text' },
    yearsExperience: { column: 'years_experience', cast: 'int' },
    createdAt: { column: 'created_at', cast: 'timestamptz' },
  },
  defaultSort: 'fullName',
  defaultOrder: 'asc',
};

// Filters shared by GET /agents and the nested GET /agencies/:id/agents.
export const agentFilters = {
  minExperience: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().min(1).max(100).optional(),
};

export function agentConditions(filters: { agencyId?: string; minExperience?: number; q?: string }) {
  const c = new Conditions();
  if (filters.agencyId) c.add(`agency_id = ${c.param(filters.agencyId)}`);
  if (filters.minExperience !== undefined) c.add(`years_experience >= ${c.param(filters.minExperience)}`);
  if (filters.q) c.add(`full_name ilike ${c.param(likePattern(filters.q))}`);
  return c;
}

const listQuery = z.strictObject({ ...pageParams(agentsSpec), ...agentFilters, agencyId: z.uuid().optional() });
const nestedListingsQuery = z
  .strictObject({ ...pageParams(listingsSpec), ...listingFilters })
  .refine(...priceRangeIsOrdered);

export const agentsRouter = Router();

agentsRouter.get('/', async (req, res) => {
  const { limit, cursor, sort, order, offset: _, ...filters } = parseQuery(listQuery, req.query);
  res.json(await listPage(agentsSpec, { limit, cursor, sort, order }, filters, agentConditions(filters)));
});

agentsRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Agent');
  const { rows } = await pool.query(`select ${agentsSpec.columns} from agents where id = $1`, [id]);
  if (!rows[0]) throw notFound('Agent');
  res.json({ data: rows[0] });
});

agentsRouter.get('/:id/listings', async (req, res) => {
  const agentId = parseId(req.params.id, 'Agent');
  const { limit, cursor, sort, order, offset: _, ...rest } = parseQuery(nestedListingsQuery, req.query);
  const exists = await pool.query('select 1 from agents where id = $1', [agentId]);
  if (!exists.rowCount) throw notFound('Agent');
  const filters = { ...rest, agentId };
  res.json(await listPage(listingsSpec, { limit, cursor, sort, order }, filters, listingConditions(filters)));
});
