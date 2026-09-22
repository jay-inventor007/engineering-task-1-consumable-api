// Seeds realistic Nigerian property-market data.
//
// Repeatable: Faker is seeded with a fixed number and a fixed reference date, so every run
// generates the exact same records, including the same UUIDs. Every insert uses
// `on conflict (id) do nothing`, so a second run inserts zero rows instead of duplicating.

import { fakerEN_NG as faker } from '@faker-js/faker';
import type { PoolClient } from 'pg';
import { pool } from '../src/db.js';

const SEED = 20260922;
const REFERENCE_DATE = new Date('2026-09-01T09:00:00Z');

const COUNTS = { agencies: 200, agents: 400, listings: 800, viewings: 500 };

// City, state, and neighbourhoods a buyer would actually search in.
const LOCATIONS = [
  { city: 'Lagos', state: 'Lagos', areas: ['Lekki Phase 1', 'Ikoyi', 'Victoria Island', 'Ikeja GRA', 'Yaba', 'Ajah', 'Surulere', 'Magodo'] },
  { city: 'Abuja', state: 'FCT', areas: ['Maitama', 'Asokoro', 'Wuse 2', 'Gwarinpa', 'Jabi', 'Katampe'] },
  { city: 'Port Harcourt', state: 'Rivers', areas: ['GRA Phase 2', 'Trans Amadi', 'Rumuola', 'Peter Odili Road'] },
  { city: 'Ibadan', state: 'Oyo', areas: ['Bodija', 'Jericho', 'Oluyole Estate', 'Akobo'] },
  { city: 'Asaba', state: 'Delta', areas: ['Okpanam Road', 'DBS Road', 'Summit Road', 'GRA'] },
  { city: 'Enugu', state: 'Enugu', areas: ['Independence Layout', 'Trans Ekulu', 'GRA', 'New Haven'] },
  { city: 'Benin City', state: 'Edo', areas: ['GRA', 'Ugbowo', 'Sapele Road', 'Ikpoba Hill'] },
  { city: 'Kano', state: 'Kano', areas: ['Nassarawa GRA', 'Bompai', 'Tarauni'] },
] as const;

type PropertyType = 'apartment' | 'duplex' | 'bungalow' | 'terrace' | 'land';

// Price ranges in whole naira. Sale prices are totals; rent prices are per year, as is usual in Nigeria.
const PRICE_NAIRA: Record<PropertyType, { sale: [number, number]; rent: [number, number] | null }> = {
  apartment: { sale: [30_000_000, 250_000_000], rent: [1_500_000, 15_000_000] },
  duplex: { sale: [80_000_000, 900_000_000], rent: [5_000_000, 40_000_000] },
  bungalow: { sale: [25_000_000, 150_000_000], rent: [1_000_000, 8_000_000] },
  terrace: { sale: [60_000_000, 400_000_000], rent: [3_000_000, 20_000_000] },
  land: { sale: [5_000_000, 300_000_000], rent: null }, // land is sold, not let
};

function nairaToKobo(naira: number): number {
  const roundedToNearest50k = Math.round(naira / 50_000) * 50_000;
  return roundedToNearest50k * 100;
}

async function insertRows(client: PoolClient, table: string, columns: string[], rows: unknown[][]) {
  let inserted = 0;
  const chunkSize = 200;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const result = await client.query(
      `insert into ${table} (${columns.join(', ')}) values ${tuples.join(', ')} on conflict (id) do nothing`,
      values,
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

const FEATURES = [
  'fitted kitchen', 'all rooms en suite', 'boys quarters', 'ample parking space', '24-hour power supply',
  'borehole water', 'swimming pool', 'gated estate with security', 'POP ceilings', 'walk-in closet',
  'rooftop terrace', 'staff quarters', 'solar inverter backup', 'CCTV', 'good road network',
];

function describe(propertyType: PropertyType, area: string, listingType: 'sale' | 'rent'): string {
  if (propertyType === 'land') {
    const title = faker.helpers.arrayElement(['C of O', 'Governor’s consent', 'registered survey', 'deed of assignment']);
    return `Dry, fenced land in ${area} with ${title}. Suitable for residential development. Serious buyers only; inspection by appointment.`;
  }
  const features = faker.helpers.arrayElements(FEATURES, { min: 2, max: 4 }).join(', ');
  const terms = listingType === 'rent' ? 'Annual rent; agency and legal fees apply.' : 'Title documents available for verification.';
  return `Well-finished ${propertyType} in ${area} with ${features}. ${terms}`;
}

function buildData() {
  faker.seed(SEED);
  faker.setDefaultRefDate(REFERENCE_DATE);

  const agencies = Array.from({ length: COUNTS.agencies }, () => {
    const location = faker.helpers.arrayElement(LOCATIONS);
    const surname = faker.person.lastName();
    const name = `${surname} ${faker.helpers.arrayElement(['Realty', 'Properties', 'Homes', 'Estates', '& Partners', 'Property Consult'])}`;
    return {
      id: faker.string.uuid(),
      name,
      city: location.city,
      state: location.state,
      phone: faker.phone.number(),
      email: `hello@${surname.toLowerCase().replace(/[^a-z]/g, '')}${faker.string.numeric(3)}.ng`,
      foundedYear: faker.number.int({ min: 1975, max: 2024 }),
    };
  });

  // The first pass assigns parents round-robin so that no agency is left without agents and no
  // agent without listings (an empty nested endpoint for a real parent looks like a bug);
  // after that, parents are picked at random so the distribution is uneven, like a real market.
  const pickParent = <T>(parents: T[], i: number) => (i < parents.length ? parents[i]! : faker.helpers.arrayElement(parents));

  const agents = Array.from({ length: COUNTS.agents }, (_, i) => {
    const agency = pickParent(agencies, i);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    return {
      id: faker.string.uuid(),
      agencyId: agency.id,
      city: agency.city,
      fullName: `${firstName} ${lastName}`,
      // The index suffix guarantees uniqueness against the unique constraint on email.
      email: `${firstName}.${lastName}.${i}@agents.example.ng`.toLowerCase().replace(/[^a-z0-9.@]/g, ''),
      phone: faker.phone.number(),
      yearsExperience: faker.number.int({ min: 0, max: 30 }),
    };
  });

  const listings = Array.from({ length: COUNTS.listings }, (_, i) => {
    const agent = pickParent(agents, i);
    const location = LOCATIONS.find((l) => l.city === agent.city)!;
    const area = faker.helpers.arrayElement(location.areas);
    const propertyType = faker.helpers.arrayElement<PropertyType>(['apartment', 'duplex', 'bungalow', 'terrace', 'land']);
    const ranges = PRICE_NAIRA[propertyType];
    const listingType = ranges.rent && faker.datatype.boolean({ probability: 0.4 }) ? 'rent' : 'sale';
    const [min, max] = listingType === 'rent' ? ranges.rent! : ranges.sale;
    const bedrooms =
      propertyType === 'land' ? 0 : propertyType === 'apartment' ? faker.number.int({ min: 1, max: 4 }) : faker.number.int({ min: 2, max: 6 });
    const status = faker.helpers.weightedArrayElement([
      { weight: 70, value: 'active' },
      { weight: 12, value: 'under_offer' },
      { weight: 18, value: listingType === 'rent' ? 'let' : 'sold' },
    ]);
    const title =
      propertyType === 'land'
        ? `${faker.helpers.arrayElement(['600sqm', '900sqm', '1,200sqm', '2 plots of', 'Half plot of'])} land in ${area}`
        : `${bedrooms}-bedroom ${propertyType} in ${area}`;
    return {
      id: faker.string.uuid(),
      agentId: agent.id,
      title,
      description: describe(propertyType, area, listingType),
      listingType,
      propertyType,
      status,
      priceMinor: nairaToKobo(faker.number.int({ min, max })),
      currency: 'NGN',
      bedrooms,
      bathrooms: propertyType === 'land' ? 0 : bedrooms + faker.number.int({ min: 0, max: 1 }),
      address: `${faker.location.buildingNumber()} ${faker.location.street()}, ${area}`,
      city: location.city,
      state: location.state,
      listedAt: faker.date.past({ years: 2 }),
    };
  });

  const activeListings = listings.filter((l) => l.status === 'active');
  // Viewings land on the hour, 9am to 5pm, so collisions on (listing, time) are plausible; the
  // Set below skips any duplicate slot the generator produces, mirroring the unique index.
  const takenSlots = new Set<string>();
  const viewings: Array<Record<string, unknown>> = [];
  while (viewings.length < COUNTS.viewings) {
    const listing = faker.helpers.arrayElement(activeListings);
    const day = faker.date.between({ from: '2026-08-01T00:00:00Z', to: '2026-10-31T00:00:00Z' });
    day.setUTCHours(faker.number.int({ min: 8, max: 16 }), 0, 0, 0); // 9am-5pm Lagos time (UTC+1)
    const id = faker.string.uuid();
    const slotKey = `${listing.id}|${day.toISOString()}`;
    const isPast = day < REFERENCE_DATE;
    const status = isPast
      ? faker.helpers.arrayElement(['completed', 'completed', 'cancelled'])
      : faker.helpers.arrayElement(['requested', 'confirmed', 'confirmed', 'cancelled']);
    if (takenSlots.has(slotKey)) continue;
    if (status !== 'cancelled') takenSlots.add(slotKey);
    viewings.push({
      id,
      listingId: listing.id,
      requesterName: faker.person.fullName(),
      requesterEmail: faker.internet.email().toLowerCase(),
      scheduledFor: day,
      status,
      notes: faker.datatype.boolean({ probability: 0.3 }) ? faker.lorem.sentence() : null,
    });
  }

  return { agencies, agents, listings, viewings };
}

async function main() {
  const data = buildData();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const inserted = {
      agencies: await insertRows(
        client,
        'agencies',
        ['id', 'name', 'city', 'state', 'phone', 'email', 'founded_year'],
        data.agencies.map((a) => [a.id, a.name, a.city, a.state, a.phone, a.email, a.foundedYear]),
      ),
      agents: await insertRows(
        client,
        'agents',
        ['id', 'agency_id', 'full_name', 'email', 'phone', 'years_experience'],
        data.agents.map((a) => [a.id, a.agencyId, a.fullName, a.email, a.phone, a.yearsExperience]),
      ),
      listings: await insertRows(
        client,
        'listings',
        ['id', 'agent_id', 'title', 'description', 'listing_type', 'property_type', 'status', 'price_minor', 'currency', 'bedrooms', 'bathrooms', 'address', 'city', 'state', 'listed_at'],
        data.listings.map((l) => [l.id, l.agentId, l.title, l.description, l.listingType, l.propertyType, l.status, l.priceMinor, l.currency, l.bedrooms, l.bathrooms, l.address, l.city, l.state, l.listedAt]),
      ),
      viewings: await insertRows(
        client,
        'viewings',
        ['id', 'listing_id', 'requester_name', 'requester_email', 'scheduled_for', 'status', 'notes'],
        data.viewings.map((v) => [v.id, v.listingId, v.requesterName, v.requesterEmail, v.scheduledFor, v.status, v.notes]),
      ),
    };
    await client.query('commit');

    const { rows } = await client.query(`
      select (select count(*) from agencies) as agencies,
             (select count(*) from agents)   as agents,
             (select count(*) from listings) as listings,
             (select count(*) from viewings) as viewings`);
    console.log('inserted this run:', inserted);
    console.log('rows in database: ', rows[0]);
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
