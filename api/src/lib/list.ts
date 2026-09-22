// Shared engine behind every list endpoint: validation of limit/cursor/sort/order, filtering,
// keyset (cursor) pagination, and the { data, meta } envelope.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ApiError } from './errors.js';

export type SortField = { column: string; cast: 'text' | 'int' | 'bigint' | 'timestamptz' };

export type ListSpec = {
  from: string;
  columns: string;
  sortFields: Record<string, SortField>;
  defaultSort: string;
  defaultOrder: 'asc' | 'desc';
};

// Query parameters every list endpoint accepts. Route files spread this into a strict object
// alongside their own filters, so an unknown parameter is a 400 rather than silently ignored.
export function pageParams(spec: ListSpec) {
  const sortNames = Object.keys(spec.sortFields) as [string, ...string[]];
  return {
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .transform((n) => Math.min(n ?? config.pagination.defaultLimit, config.pagination.maxLimit)),
    cursor: z.string().optional(),
    sort: z.enum(sortNames).default(spec.defaultSort),
    order: z.enum(['asc', 'desc']).default(spec.defaultOrder),
    offset: z
      .never({ error: 'is not supported: this API uses cursor pagination; pass meta.nextCursor as ?cursor=' })
      .optional(),
  };
}

type PageQuery = { limit: number; cursor?: string; sort: string; order: 'asc' | 'desc' };

// Collects SQL conditions and their bound parameters. Values are never interpolated into SQL.
export class Conditions {
  readonly parts: string[] = [];
  readonly params: unknown[] = [];

  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  add(sql: string): this {
    this.parts.push(sql);
    return this;
  }
}

const cursorSchema = z.object({
  s: z.string(), // sort field
  o: z.enum(['asc', 'desc']),
  f: z.string(), // hash of the filters the cursor was issued under
  v: z.string(), // sort-column value of the last row, as Postgres text (keeps microseconds)
  id: z.uuid(), // id of the last row: the tiebreaker when sort values repeat
});
type Cursor = z.infer<typeof cursorSchema>;

const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url');

function decodeCursor(raw: string): Cursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    throw new ApiError(400, 'INVALID_CURSOR', 'cursor is malformed; use meta.nextCursor from a previous response');
  }
}

function hashFilters(filters: Record<string, unknown>): string {
  const stable = Object.keys(filters)
    .filter((k) => filters[k] !== undefined)
    .sort()
    .map((k) => [k, filters[k]]);
  return createHash('sha256').update(JSON.stringify(stable)).digest('base64url').slice(0, 12);
}

export async function listPage(spec: ListSpec, page: PageQuery, filters: Record<string, unknown>, conditions: Conditions) {
  const sortField = spec.sortFields[page.sort]!;
  const filterHash = hashFilters(filters);
  const where = (parts: string[]) => (parts.length ? `where ${parts.join(' and ')}` : '');

  const countResult = await pool.query<{ total: number }>(
    `select count(*) as total from ${spec.from} ${where(conditions.parts)}`,
    conditions.params,
  );
  const total = countResult.rows[0]?.total ?? 0;

  const parts = [...conditions.parts];
  const params = [...conditions.params];
  if (page.cursor) {
    const cursor = decodeCursor(page.cursor);
    if (cursor.s !== page.sort || cursor.o !== page.order || cursor.f !== filterHash) {
      throw new ApiError(
        400,
        'INVALID_CURSOR',
        'cursor was issued for a different sort, order, or set of filters; drop the cursor to start from the first page',
      );
    }
    params.push(cursor.v, cursor.id);
    const comparison = page.order === 'asc' ? '>' : '<';
    parts.push(`(${sortField.column}, id) ${comparison} ($${params.length - 1}::${sortField.cast}, $${params.length}::uuid)`);
  }
  // Fetch one extra row: if it exists there is a next page, and it is dropped from the response.
  params.push(page.limit + 1);

  const { rows } = await pool.query<Record<string, unknown>>(
    `select ${spec.columns}, ${sortField.column}::text as "__cursorValue"
       from ${spec.from}
       ${where(parts)}
      order by ${sortField.column} ${page.order}, id ${page.order}
      limit $${params.length}`,
    params,
  );

  const hasMore = rows.length > page.limit;
  const pageRows = rows.slice(0, page.limit);
  const last = pageRows.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ s: page.sort, o: page.order, f: filterHash, v: String(last.__cursorValue), id: String(last.id) })
      : null;

  return {
    data: pageRows.map(({ __cursorValue, ...row }) => row),
    meta: { total, limit: page.limit, hasMore, nextCursor },
  };
}
