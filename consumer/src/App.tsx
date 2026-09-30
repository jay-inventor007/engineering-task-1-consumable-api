import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_BASE_URL as string | undefined;
const PAGE_SIZE = 10;
const CITIES = ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Asaba', 'Enugu', 'Benin City', 'Kano'];
const SORTS = {
  newest: { sort: 'listedAt', order: 'desc' },
  priceLow: { sort: 'price', order: 'asc' },
  priceHigh: { sort: 'price', order: 'desc' },
} as const;

type Listing = {
  id: string;
  title: string;
  listingType: 'sale' | 'rent';
  propertyType: string;
  status: string;
  priceMinor: number;
  currency: string;
  bedrooms: number;
  city: string;
  address: string;
};
type Page = { data: Listing[]; meta: { total: number; limit: number; hasMore: boolean; nextCursor: string | null } };
type Filters = { city: string; listingType: string; sortKey: keyof typeof SORTS; q: string };

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; page: Page };

function formatPrice(listing: Listing) {
  const amount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: listing.currency, maximumFractionDigits: 0 }).format(
    listing.priceMinor / 100,
  );
  return listing.listingType === 'rent' ? `${amount} / year` : amount;
}

export function App() {
  const [filters, setFilters] = useState<Filters>({ city: '', listingType: '', sortKey: 'newest', q: '' });
  const [search, setSearch] = useState('');
  // cursors[0] is the first page (no cursor); each "Next" pushes the cursor for the following page.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const cursor = cursors[cursors.length - 1];

  useEffect(() => {
    if (!API) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), ...SORTS[filters.sortKey] });
    if (filters.city) params.set('city', filters.city);
    if (filters.listingType) params.set('listingType', filters.listingType);
    if (filters.q) params.set('q', filters.q);
    if (cursor) params.set('cursor', cursor);

    setState({ kind: 'loading' });
    fetch(`${API}/listings?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (res.ok) return setState({ kind: 'ready', page: body as Page });
        const retryAfter = res.headers.get('Retry-After');
        const message = body?.error?.message ?? `The API answered with status ${res.status}`;
        setState({ kind: 'error', message: retryAfter ? `${message} (retry in ${retryAfter}s)` : message });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'error', message: `Could not reach the API: ${err.message}` });
      });
    return () => controller.abort();
  }, [filters, cursor, reloadToken]);

  const changeFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setCursors([null]); // a cursor belongs to one filter set, so any filter change restarts at page 1
  };

  // The box updates on every keystroke but only reaches `filters` after typing pauses, so one
  // request goes out per pause rather than per character. A single character is held back,
  // because the API requires at least two.
  useEffect(() => {
    const q = search.trim();
    if (q.length === 1) return;
    const timer = setTimeout(() => {
      setFilters((f) => (f.q === q ? f : { ...f, q }));
      setCursors([null]);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  if (!API) {
    return (
      <main>
        <p className="notice error">VITE_API_BASE_URL is not set. Copy .env.example to .env and set it to the deployed API URL.</p>
      </main>
    );
  }

  const pageNumber = cursors.length;

  return (
    <main>
      <h1>Property listings</h1>
      <p className="source">
        Live data from <code>{API}</code>
      </p>

      <div className="controls">
        <label>
          Search
          <input
            type="search"
            placeholder="e.g. duplex Ikoyi"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          City
          <select value={filters.city} onChange={(e) => changeFilter({ city: e.target.value })}>
            <option value="">All cities</option>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select value={filters.listingType} onChange={(e) => changeFilter({ listingType: e.target.value })}>
            <option value="">Sale and rent</option>
            <option value="sale">For sale</option>
            <option value="rent">For rent</option>
          </select>
        </label>
        <label>
          Sort
          <select value={filters.sortKey} onChange={(e) => changeFilter({ sortKey: e.target.value as Filters['sortKey'] })}>
            <option value="newest">Newest first</option>
            <option value="priceLow">Price: low to high</option>
            <option value="priceHigh">Price: high to low</option>
          </select>
        </label>
      </div>

      {state.kind === 'loading' && <p className="notice">Loading…</p>}

      {state.kind === 'error' && (
        <div className="notice error">
          <p>{state.message}</p>
          <button onClick={() => setReloadToken((t) => t + 1)}>Try again</button>
        </div>
      )}

      {state.kind === 'ready' && state.page.data.length === 0 && (
        <div className="notice">
          <p>No listings match these filters.</p>
          <button
            onClick={() => {
              setSearch('');
              changeFilter({ city: '', listingType: '', q: '' });
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.page.data.length > 0 && (
        <>
          <p className="summary">
            {state.page.meta.total} listings · page {pageNumber} of {Math.ceil(state.page.meta.total / PAGE_SIZE)}
          </p>
          <ul className="listings">
            {state.page.data.map((l) => (
              <li key={l.id}>
                <div className="title">{l.title}</div>
                <div className="price">{formatPrice(l)}</div>
                <div className="meta">
                  {l.address}, {l.city} · {l.propertyType}
                  {l.status !== 'active' && <span className="badge">{l.status.replace('_', ' ')}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="pager">
        <button disabled={cursors.length === 1} onClick={() => setCursors((c) => c.slice(0, -1))}>
          Previous page
        </button>
        <button
          disabled={state.kind !== 'ready' || !state.page.meta.hasMore}
          onClick={() => state.kind === 'ready' && setCursors((c) => [...c, state.page.meta.nextCursor])}
        >
          Next page
        </button>
      </div>
    </main>
  );
}
