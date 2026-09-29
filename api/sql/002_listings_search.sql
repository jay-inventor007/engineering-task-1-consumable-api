-- Full-text search over listings: q matches title, description, address, city, and state.
-- The vector is a generated column, so the database computes it on every write and it can never
-- drift from the row. The GIN index is what makes @@ lookups fast; a b-tree cannot index a tsvector.

alter table listings
  add column search_vector tsvector
  generated always as (
    to_tsvector('english', title || ' ' || description || ' ' || address || ' ' || city || ' ' || state)
  ) stored;

create index listings_search_vector on listings using gin (search_vector);
