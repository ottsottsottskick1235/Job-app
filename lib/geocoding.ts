export type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string;
  provider: 'nominatim';
  providerPlaceId: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postalCode?: string | null;
};

export type NominatimResult = {
  lat: string;
  lon: string;
  display_name?: string;
  place_id?: string | number;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    province?: string;
    country?: string;
    postcode?: string;
  };
};

export function normalizeGeocodeQuery(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseNominatimResult(input: NominatimResult): GeocodeResult {
  const latitude = Number(input.lat);
  const longitude = Number(input.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('Geocoding provider returned invalid coordinates.');
  }

  const address = input.address ?? {};
  return {
    latitude,
    longitude,
    displayName: input.display_name ?? `${latitude}, ${longitude}`,
    provider: 'nominatim',
    providerPlaceId: String(input.place_id ?? ''),
    city: address.city ?? address.town ?? address.village ?? address.municipality ?? null,
    region: address.state ?? address.province ?? null,
    country: address.country ?? null,
    postalCode: address.postcode ?? null,
  };
}

export function buildNominatimSearchUrl(query: string, baseUrl = 'https://nominatim.openstreetmap.org') {
  const url = new URL('/search', baseUrl);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  return url.toString();
}

export async function geocodeWithNominatim(
  query: string,
  options: {
    fetchImpl?: typeof fetch;
    baseUrl?: string;
    userAgent?: string;
  } = {},
) {
  const normalized = normalizeGeocodeQuery(query);
  if (normalized.length < 3) throw new Error('Address query is too short.');

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildNominatimSearchUrl(query, options.baseUrl), {
    headers: {
      'Accept': 'application/json',
      'User-Agent': options.userAgent ?? 'JobApp/0.2 (configure GEOCODING_USER_AGENT)',
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Geocoding provider failed with HTTP ${response.status}.`);

  const payload = await response.json() as NominatimResult[];
  return payload.map(parseNominatimResult);
}
