import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { notFound } from '../lib/errors.js';
import { Conditions, listPage, pageParams, type ListSpec } from '../lib/list.js';
import { likePattern } from '../lib/sql.js';
import { parseId, parseQuery } from '../lib/validate.js';
import { agentConditions, agentFilters, agentsSpec } from './agents.js';

const agenciesSpec: ListSpec = {
  from: 'agencies',
  columns: `id, name, city, state, phone, email, founded_year as "foundedYear",
            created_at as "createdAt", updated_at as "updatedAt"`,
  sortFields: {
    name: { column: 'name', cast: 'text' },
    foundedYear: { column: 'founded_year', cast: 'int' },
    createdAt: { column: 'created_at', cast: 'timestamptz' },
  },
  defaultSort: 'name',
  defaultOrder: 'asc',
};

const listQuery = z.strictObject({
  ...pageParams(agenciesSpec),
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

const nestedAgentsQuery = z.strictObject({ ...pageParams(agentsSpec), ...agentFilters });

export const agenciesRouter = Router();

agenciesRouter.get('/', async (req, res) => {
  const { limit, cursor, sort, order, offset: _, ...filters } = parseQuery(listQuery, req.query);
  const c = new Conditions();
  if (filters.city) c.add(`lower(city) = lower(${c.param(filters.city)})`);
  if (filters.state) c.add(`lower(state) = lower(${c.param(filters.state)})`);
  if (filters.q) c.add(`name ilike ${c.param(likePattern(filters.q))}`);
  res.json(await listPage(agenciesSpec, { limit, cursor, sort, order }, filters, c));
});

agenciesRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Agency');
  const { rows } = await pool.query(`select ${agenciesSpec.columns} from agencies where id = $1`, [id]);
  if (!rows[0]) throw notFound('Agency');
  res.json({ data: rows[0] });
});

agenciesRouter.get('/:id/agents', async (req, res) => {
  const agencyId = parseId(req.params.id, 'Agency');
  const { limit, cursor, sort, order, offset: _, ...rest } = parseQuery(nestedAgentsQuery, req.query);
  const exists = await pool.query('select 1 from agencies where id = $1', [agencyId]);
  if (!exists.rowCount) throw notFound('Agency');
  const filters = { ...rest, agencyId };
  res.json(await listPage(agentsSpec, { limit, cursor, sort, order }, filters, agentConditions(filters)));
});
