import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { ApiError, notFound } from '../lib/errors.js';
import { parseBody, parseId } from '../lib/validate.js';

const columns = `id, listing_id as "listingId", requester_name as "requesterName",
                 requester_email as "requesterEmail", scheduled_for as "scheduledFor", status, notes,
                 created_at as "createdAt", updated_at as "updatedAt"`;

const futureDateTime = z.iso
  .datetime({ offset: true })
  .refine((value) => new Date(value) > new Date(), { message: 'must be in the future' });

const createBody = z.strictObject({
  listingId: z.uuid(),
  requesterName: z.string().trim().min(1).max(120),
  requesterEmail: z.email().max(254),
  scheduledFor: futureDateTime,
  notes: z.string().trim().max(1000).nullable().optional(),
});

const updateBody = z
  .strictObject({
    scheduledFor: futureDateTime.optional(),
    status: z.enum(['confirmed', 'cancelled', 'completed']).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'provide at least one of scheduledFor, status, notes' });

// The partial unique index that stops two live viewings sharing a listing and time slot.
const SLOT_INDEX = 'viewings_one_live_booking_per_slot';
const slotTaken = () => new ApiError(409, 'SLOT_TAKEN', 'This listing already has a viewing booked at that time');
const isSlotViolation = (err: unknown) =>
  (err as { code?: string; constraint?: string })?.code === '23505' && (err as { constraint?: string }).constraint === SLOT_INDEX;

export const viewingsRouter = Router();

viewingsRouter.post('/', async (req, res) => {
  const body = parseBody(createBody, req.body);

  const listing = await pool.query<{ status: string }>('select status from listings where id = $1', [body.listingId]);
  if (!listing.rows[0]) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'The request body failed validation', [
      { field: 'listingId', message: 'does not match any listing' },
    ]);
  }
  if (listing.rows[0].status !== 'active') {
    throw new ApiError(409, 'LISTING_UNAVAILABLE', `This listing is ${listing.rows[0].status} and cannot take viewings`);
  }

  try {
    const { rows } = await pool.query(
      `insert into viewings (listing_id, requester_name, requester_email, scheduled_for, notes)
       values ($1, $2, $3, $4, $5) returning ${columns}`,
      [body.listingId, body.requesterName, body.requesterEmail, body.scheduledFor, body.notes ?? null],
    );
    res.status(201).location(`/api/v1/viewings/${rows[0].id}`).json({ data: rows[0] });
  } catch (err) {
    if (isSlotViolation(err)) throw slotTaken();
    throw err;
  }
});

viewingsRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Viewing');
  const { rows } = await pool.query(`select ${columns} from viewings where id = $1`, [id]);
  if (!rows[0]) throw notFound('Viewing');
  res.json({ data: rows[0] });
});

viewingsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Viewing');
  const body = parseBody(updateBody, req.body);

  // Only fields present in the body are changed. The status guard lives in the same UPDATE, so a
  // viewing that is already cancelled or completed cannot be changed even by concurrent requests.
  const sets: string[] = [];
  const params: unknown[] = [id];
  const set = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (body.scheduledFor !== undefined) set('scheduled_for', body.scheduledFor);
  if (body.status !== undefined) set('status', body.status);
  if (body.notes !== undefined) set('notes', body.notes);

  try {
    const { rows } = await pool.query(
      `update viewings set ${sets.join(', ')}
        where id = $1 and status in ('requested', 'confirmed')
        returning ${columns}`,
      params,
    );
    if (rows[0]) return res.json({ data: rows[0] });
  } catch (err) {
    if (isSlotViolation(err)) throw slotTaken();
    throw err;
  }

  // Nothing was updated: either the viewing does not exist, or it is closed.
  const existing = await pool.query<{ status: string }>('select status from viewings where id = $1', [id]);
  if (!existing.rows[0]) throw notFound('Viewing');
  throw new ApiError(409, 'VIEWING_CLOSED', `This viewing is ${existing.rows[0].status} and can no longer be changed`);
});

viewingsRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Viewing');
  const result = await pool.query('delete from viewings where id = $1', [id]);
  if (!result.rowCount) throw notFound('Viewing');
  res.status(204).end();
});
