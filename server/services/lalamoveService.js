import crypto from 'node:crypto';

export const LALAMOVE_QUOTATION_PATH = '/v3/quotations';
export const LALAMOVE_CITIES_PATH = '/v3/cities';
const SANDBOX_BASE_URL = 'https://rest.sandbox.lalamove.com';
const PRODUCTION_BASE_URL = 'https://rest.lalamove.com';
const CITY_CACHE_TTL_MS = 5 * 60 * 1000;
const cityInfoCache = new Map();

export class LalamoveError extends Error {
  constructor(message, {
    status = 500,
    code = 'LALAMOVE_ERROR',
    detail = null,
    errors = [],
    requestId = null,
    meta = null,
    cause,
  } = {}) {
    super(message, { cause });
    this.name = 'LalamoveError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.errors = errors;
    this.requestId = requestId;
    this.meta = meta;
  }
}

function normalizeEnvironment(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['production', 'prod', 'live'].includes(normalized)) return 'production';
  if (['sandbox', 'test', 'testing'].includes(normalized)) return 'sandbox';
  return null;
}

function keyEnvironment(key) {
  if (String(key || '').startsWith('pk_prod')) return 'production';
  if (String(key || '').startsWith('pk_test')) return 'sandbox';
  return null;
}

/** Resolve endpoint and credentials without ever exposing the secret to the client. */
export function getLalamoveConfig(env = process.env) {
  const apiKey = String(env.LALAMOVE_API_KEY || '').trim();
  const apiSecret = String(env.LALAMOVE_API_SECRET || '').trim();
  const market = String(env.LALAMOVE_MARKET || 'PH').trim().toUpperCase();
  const language = market === 'PH'
    ? 'en_PH'
    : String(env.LALAMOVE_LANGUAGE || 'en').trim();
  const explicitEnvironment = normalizeEnvironment(env.LALAMOVE_ENV);
  const inferredEnvironment = keyEnvironment(apiKey);
  const environment = explicitEnvironment || inferredEnvironment || 'sandbox';
  const secretEnvironment = String(apiSecret).startsWith('sk_prod')
    ? 'production'
    : String(apiSecret).startsWith('sk_test')
      ? 'sandbox'
      : null;

  if (!apiKey || !apiSecret) {
    throw new LalamoveError('Lalamove API credentials are not configured', {
      code: 'LALAMOVE_CONFIGURATION_ERROR',
      status: 500,
    });
  }
  if (inferredEnvironment && inferredEnvironment !== environment) {
    throw new LalamoveError('Lalamove API key does not match the configured environment', {
      code: 'LALAMOVE_CONFIGURATION_ERROR',
      status: 500,
    });
  }
  if (secretEnvironment && secretEnvironment !== environment) {
    throw new LalamoveError('Lalamove API secret does not match the configured environment', {
      code: 'LALAMOVE_CONFIGURATION_ERROR',
      status: 500,
    });
  }

  return {
    apiKey,
    apiSecret,
    market,
    language,
    environment,
    baseUrl: environment === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL,
  };
}

export function isValidCoordinates(coords) {
  if (!coords || typeof coords !== 'object') return false;
  const lat = Number(coords.lat);
  const lng = Number(coords.lng);
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180
    && !(lat === 0 && lng === 0);
}

function validateCoordinates(coords, name) {
  if (!isValidCoordinates(coords)) {
    throw new LalamoveError(`${name} must contain finite, non-zero { lat, lng } coordinates`, {
      code: 'ERR_INVALID_COORDINATES',
      status: 400,
    });
  }
}

export function buildQuotationPayload({
  pickupCoords,
  dropoffCoords,
  pickupAddress,
  dropoffAddress,
  serviceType,
  language = 'en_PH',
  scheduleAt,
}) {
  validateCoordinates(pickupCoords, 'pickupCoords');
  validateCoordinates(dropoffCoords, 'dropoffCoords');
  if (!String(pickupAddress || '').trim() || !String(dropoffAddress || '').trim()) {
    throw new LalamoveError('pickupAddress and dropoffAddress are required', {
      code: 'ERR_INVALID_ADDRESS',
      status: 400,
    });
  }
  if (!String(serviceType || '').trim()) {
    throw new LalamoveError('serviceType is required', {
      code: 'ERR_INVALID_SERVICE_TYPE',
      status: 422,
    });
  }

  const payload = {
    data: {
      serviceType: String(serviceType).trim(),
      language,
      stops: [
        {
          coordinates: {
            lat: String(Number(pickupCoords.lat)),
            lng: String(Number(pickupCoords.lng)),
          },
          address: String(pickupAddress).trim(),
        },
        {
          coordinates: {
            lat: String(Number(dropoffCoords.lat)),
            lng: String(Number(dropoffCoords.lng)),
          },
          address: String(dropoffAddress).trim(),
        },
      ],
    },
  };
  if (scheduleAt) payload.data.scheduleAt = scheduleAt;
  return payload;
}

export function createSignature({ secret, timestamp, method, path, body = '' }) {
  const raw = `${timestamp}\r\n${String(method).toUpperCase()}\r\n${path}\r\n\r\n${body}`;
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

function responseRequestId(response, body) {
  return body?.meta?.requestId
    || body?.data?.meta?.requestId
    || response.headers.get('x-request-id')
    || response.headers.get('request-id')
    || null;
}

function extractErrors(body) {
  if (Array.isArray(body?.errors)) return body.errors;
  if (Array.isArray(body?.data?.errors)) return body.data.errors;
  return [];
}

function summarizeErrors(errors) {
  return errors.map(error => ({
    id: error?.id || null,
    message: error?.message || null,
    detail: error?.detail || null,
    requestId: error?.meta?.requestId || null,
  }));
}

function sanitizedCoordinates(coords) {
  if (!coords) return null;
  return {
    lat: Number.isFinite(Number(coords.lat)) ? Number(Number(coords.lat).toFixed(4)) : null,
    lng: Number.isFinite(Number(coords.lng)) ? Number(Number(coords.lng).toFixed(4)) : null,
  };
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function requestLalamove({
  path,
  method = 'GET',
  payload,
  config,
  fetchImpl = globalThis.fetch,
  context = {},
}) {
  if (typeof fetchImpl !== 'function') {
    throw new LalamoveError('Fetch is not available on the server', {
      code: 'LALAMOVE_CONFIGURATION_ERROR',
      status: 500,
    });
  }

  const body = payload === undefined ? '' : JSON.stringify(payload);
  const timestamp = String(Date.now());
  const requestId = crypto.randomUUID();
  const signature = createSignature({
    secret: config.apiSecret,
    timestamp,
    method,
    path,
    body,
  });
  const url = `${config.baseUrl}${path}`;
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `hmac ${config.apiKey}:${timestamp}:${signature}`,
      Market: config.market,
      'Request-ID': requestId,
      Accept: 'application/json',
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { body }),
  });
  const responseBody = await readResponseBody(response);
  if (!response.ok) {
    const errors = extractErrors(responseBody);
    const summarized = summarizeErrors(errors);
    const firstError = errors[0] || {};
    const error = new LalamoveError(
      firstError.message || responseBody?.message || `Lalamove request failed with HTTP ${response.status}`,
      {
        status: response.status,
        code: firstError.id || responseBody?.code || 'LALAMOVE_API_ERROR',
        detail: firstError.detail || responseBody?.detail || null,
        errors: summarized,
        requestId: firstError.meta?.requestId || responseRequestId(response, responseBody),
        meta: firstError.meta || responseBody?.meta || null,
      },
    );
    console.error('[lalamove] request failed', {
      status: error.status,
      code: error.code,
      errors: error.errors,
      requestId: error.requestId,
      meta: error.meta,
      market: config.market,
      serviceType: context.serviceType || null,
      pickupCoords: sanitizedCoordinates(context.pickupCoords),
      dropoffCoords: sanitizedCoordinates(context.dropoffCoords),
    });
    throw error;
  }
  return responseBody;
}

function cityCacheKey(config) {
  return `${config.baseUrl}|${config.market}`;
}

export function clearCityInfoCache() {
  cityInfoCache.clear();
}

export async function getCityInfo({
  env = process.env,
  fetchImpl = globalThis.fetch,
  forceRefresh = false,
} = {}) {
  const config = getLalamoveConfig(env);
  const cacheKey = cityCacheKey(config);
  const cached = cityInfoCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await requestLalamove({
    path: LALAMOVE_CITIES_PATH,
    config,
    fetchImpl,
  });
  cityInfoCache.set(cacheKey, { value, expiresAt: Date.now() + CITY_CACHE_TTL_MS });
  return value;
}

function normalized(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function serviceEntry(entry) {
  if (typeof entry === 'string') return { key: entry, label: entry, description: '' };
  if (!entry || typeof entry !== 'object') return null;
  const key = entry.key || entry.serviceType || entry.service_type || entry.code;
  const label = entry.name || entry.label || entry.description || entry.displayName || key;
  if (!key) return null;
  return { key: String(key), label: String(label || key), description: String(entry.description || '') };
}

export function listServiceTypes(cityInfo) {
  const services = [];
  const seen = new Set();
  const add = entry => {
    const service = serviceEntry(entry);
    if (!service) return;
    const key = normalized(service.key);
    if (!key || seen.has(key)) return;
    seen.add(key);
    services.push(service);
  };
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const property of ['services', 'serviceTypes', 'service_types']) {
      if (Array.isArray(value[property])) value[property].forEach(add);
    }
    for (const property of ['data', 'cities', 'city', 'results']) {
      if (value[property]) visit(value[property]);
    }
  };
  visit(cityInfo);
  return services;
}

export function resolveServiceType(requested, cityInfo) {
  const services = listServiceTypes(cityInfo);
  const requestedKey = normalized(requested);
  const exact = services.find(service => normalized(service.key) === requestedKey);
  if (exact) return exact.key;

  const byLabel = services.find(service => (
    normalized(service.label) === requestedKey
    || normalized(service.description) === requestedKey
  ));
  if (byLabel) return byLabel.key;

  if (requestedKey === 'MOTORCYCLE') {
    const motorcycle = services.find(service => /motorcycle|motorbike|two.?wheel|bike/i.test(`${service.key} ${service.label} ${service.description}`));
    if (motorcycle) return motorcycle.key;
  }

  throw new LalamoveError('The requested Lalamove service type is not available', {
    code: 'ERR_INVALID_SERVICE_TYPE',
    status: 422,
  });
}

function unwrapData(value) {
  return value?.data ?? value;
}

export async function getQuotation({
  pickupCoords,
  dropoffCoords,
  pickupAddress,
  dropoffAddress,
  serviceType,
  scheduleAt,
  env = process.env,
  fetchImpl = globalThis.fetch,
  cityInfo,
}) {
  const config = getLalamoveConfig(env);
  validateCoordinates(pickupCoords, 'pickupCoords');
  validateCoordinates(dropoffCoords, 'dropoffCoords');
  if (!String(pickupAddress || '').trim() || !String(dropoffAddress || '').trim()) {
    throw new LalamoveError('pickupAddress and dropoffAddress are required', {
      code: 'ERR_INVALID_ADDRESS',
      status: 400,
    });
  }

  const availableCityInfo = cityInfo || await getCityInfo({ env, fetchImpl });
  const resolvedServiceType = resolveServiceType(serviceType, availableCityInfo);
  const payload = buildQuotationPayload({
    pickupCoords,
    dropoffCoords,
    pickupAddress,
    dropoffAddress,
    serviceType: resolvedServiceType,
    language: config.language,
    scheduleAt,
  });
  const response = await requestLalamove({
    path: LALAMOVE_QUOTATION_PATH,
    method: 'POST',
    payload,
    config,
    fetchImpl,
    context: { serviceType: resolvedServiceType, pickupCoords, dropoffCoords },
  });
  const data = unwrapData(response);
  const quotationId = data?.quotationId || data?.id;
  const total = Number(data?.priceBreakdown?.total);
  if (!quotationId) {
    throw new LalamoveError('Lalamove response is missing quotationId', {
      code: 'ERR_INVALID_QUOTATION_RESPONSE',
      status: 502,
    });
  }
  if (!data?.priceBreakdown || !Number.isFinite(total) || total < 0) {
    throw new LalamoveError('Lalamove response is missing a valid priceBreakdown.total', {
      code: 'ERR_INVALID_QUOTATION_RESPONSE',
      status: 502,
    });
  }

  return {
    quotationId,
    serviceType: data.serviceType || resolvedServiceType,
    priceBreakdown: data.priceBreakdown,
    currency: data.currency || data.priceBreakdown.currency || (config.market === 'PH' ? 'PHP' : null),
    distance: data.distance || null,
    stops: data.stops || [],
    expiresAt: data.expiresAt || null,
  };
}

export function mapLalamoveError(error) {
  const code = error?.code || error?.errors?.[0]?.id;
  if (code === 'ERR_SHIPPING_DATA_INCOMPLETE') return error?.message || 'Shipping information is incomplete for one or more products. Ask the artisan to complete it.';
  if (code === 'ERR_SHIPPING_DATA_UNAVAILABLE') return 'Product shipping information is temporarily unavailable. Please try again.';
  if (code === 'ERR_MULTIPLE_SHOPS') return 'Please check out items from one artisan shop at a time for courier delivery.';
  if (code === 'ERR_SHIPMENT_TOO_LARGE') return 'This order is too large for the available delivery vehicles.';
  if (code === 'ERR_OUT_OF_SERVICE_AREA') return "This delivery address is outside Lalamove's service area.";
  if (code === 'ERR_INVALID_SERVICE_TYPE') return 'Motorcycle delivery is currently unavailable for this route.';
  if (['ERR_REVERSE_GEOCODE_FAILURE', 'ERR_INVALID_LOCATION'].includes(code)) {
    return 'Please adjust the delivery pin to a valid road-accessible location.';
  }
  if (error?.status === 401) return 'Courier pricing is temporarily unavailable due to an internal configuration error.';
  if (error?.status === 429) return 'Courier pricing is busy right now. Please retry in a moment.';
  if (error?.status === 422) return 'Lalamove could not quote this route. Please check the delivery pin and try again.';
  if (code === 'ERR_INVALID_COORDINATES') return 'Please adjust the delivery pin to a valid location.';
  if (code === 'ERR_INVALID_ADDRESS') return 'Please provide a complete pickup and delivery address.';
  return 'We could not confirm a courier fee. Check the address and try again.';
}
