import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  buildQuotationPayload,
  clearCityInfoCache,
  createSignature,
  getQuotation,
  isValidCoordinates,
  LalamoveError,
  mapLalamoveError,
  resolveServiceType,
} from './lalamoveService.js';

const env = {
  LALAMOVE_API_KEY: 'pk_test_example',
  LALAMOVE_API_SECRET: 'sk_test_example',
  LALAMOVE_MARKET: 'PH',
};

const cityInfo = {
  data: [{
    locode: 'PH PAMP',
    services: [{ key: 'MOTORCYCLE_DELIVERY', description: 'Motorcycle' }],
  }],
};

const quoteInput = {
  pickupCoords: { lat: 15.026, lng: 120.691 },
  dropoffCoords: { lat: 15.045, lng: 120.689 },
  pickupAddress: 'Santo Tomas, Pampanga, Philippines',
  dropoffAddress: 'San Fernando, Pampanga, Philippines',
  serviceType: 'MOTORCYCLE',
};

function fakeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => clearCityInfoCache());

describe('lalamove quotation service', () => {
  it('creates the documented HMAC-SHA256 signature string', () => {
    const timestamp = '1700000000000';
    const method = 'POST';
    const path = '/v3/quotations';
    const body = JSON.stringify({ data: { serviceType: 'MOTORCYCLE' } });
    const expected = crypto
      .createHmac('sha256', 'secret')
      .update(`${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`)
      .digest('hex');

    assert.equal(createSignature({ secret: 'secret', timestamp, method, path, body }), expected);
  });

  it('rejects missing, non-finite, and 0,0 coordinates', () => {
    assert.equal(isValidCoordinates({ lat: 15, lng: 120 }), true);
    assert.equal(isValidCoordinates({ lat: Number.NaN, lng: 120 }), false);
    assert.equal(isValidCoordinates({ lat: 0, lng: 0 }), false);
    assert.throws(
      () => buildQuotationPayload({ ...quoteInput, pickupCoords: { lat: 0, lng: 0 } }),
      error => error instanceof LalamoveError && error.code === 'ERR_INVALID_COORDINATES',
    );
  });

  it('resolves the configured motorcycle label to the exact Lalamove service key', () => {
    assert.equal(resolveServiceType('MOTORCYCLE', cityInfo), 'MOTORCYCLE_DELIVERY');
    assert.throws(
      () => resolveServiceType('UNKNOWN_VEHICLE', cityInfo),
      error => error instanceof LalamoveError && error.code === 'ERR_INVALID_SERVICE_TYPE',
    );
  });

  it('fetches PH cities, signs the quote, and parses the returned PHP fee', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        assert.equal(url, 'https://rest.sandbox.lalamove.com/v3/cities');
        assert.equal(options.method, 'GET');
        assert.equal(options.headers.Market, 'PH');
        assert.match(options.headers.Authorization, /^hmac pk_test_example:\d+:[a-f0-9]{64}$/);
        return fakeResponse(200, cityInfo);
      }

      assert.equal(url, 'https://rest.sandbox.lalamove.com/v3/quotations');
      assert.equal(options.method, 'POST');
      assert.match(options.headers['Request-ID'], /^[0-9a-f-]{36}$/);
      const signatureParts = options.headers.Authorization.split(':');
      assert.equal(
        signatureParts[2],
        createSignature({
          secret: env.LALAMOVE_API_SECRET,
          timestamp: signatureParts[1],
          method: 'POST',
          path: '/v3/quotations',
          body: options.body,
        }),
      );
      const sent = JSON.parse(options.body);
      assert.equal(sent.data.language, 'en_PH');
      assert.equal(sent.data.serviceType, 'MOTORCYCLE_DELIVERY');
      assert.deepEqual(sent.data.stops[0].coordinates, { lat: '15.026', lng: '120.691' });
      assert.deepEqual(sent.data.stops[1].coordinates, { lat: '15.045', lng: '120.689' });
      return fakeResponse(201, {
        data: {
          quotationId: 'quot-123',
          serviceType: 'MOTORCYCLE_DELIVERY',
          priceBreakdown: { total: '120.00', currency: 'PHP' },
          distance: { value: '6500', unit: 'm' },
          expiresAt: '2099-01-01T00:05:00Z',
        },
      });
    };

    const quote = await getQuotation({ ...quoteInput, env, fetchImpl });

    assert.equal(calls.length, 2);
    assert.deepEqual(quote, {
      quotationId: 'quot-123',
      serviceType: 'MOTORCYCLE_DELIVERY',
      priceBreakdown: { total: '120.00', currency: 'PHP' },
      currency: 'PHP',
      distance: { value: '6500', unit: 'm' },
      stops: [],
      expiresAt: '2099-01-01T00:05:00Z',
    });
  });

  it('preserves Lalamove error ids, details, and request ids', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await assert.rejects(
        () => getQuotation({
          ...quoteInput,
          env,
          cityInfo,
          fetchImpl: async () => fakeResponse(422, {
            errors: [{
              id: 'ERR_OUT_OF_SERVICE_AREA',
              message: 'No service',
              detail: 'Dropoff is outside service area',
              meta: { requestId: 'lalamove-request-1' },
            }],
          }),
        }),
        error => error instanceof LalamoveError
          && error.status === 422
          && error.code === 'ERR_OUT_OF_SERVICE_AREA'
          && error.detail === 'Dropoff is outside service area'
          && error.requestId === 'lalamove-request-1',
      );
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(mapLalamoveError({ code: 'ERR_OUT_OF_SERVICE_AREA' }), "This delivery address is outside Lalamove's service area.");
    assert.equal(mapLalamoveError({ status: 429 }), 'Courier pricing is busy right now. Please retry in a moment.');
    assert.equal(mapLalamoveError({ status: 401 }), 'Courier pricing is temporarily unavailable due to an internal configuration error.');
  });

  it('rejects credentials that mix sandbox and production environments', async () => {
    await assert.rejects(
      () => getQuotation({
        ...quoteInput,
        env: { ...env, LALAMOVE_ENV: 'production' },
        cityInfo,
        fetchImpl: async () => fakeResponse(500, {}),
      }),
      error => error instanceof LalamoveError && error.code === 'LALAMOVE_CONFIGURATION_ERROR',
    );
  });

  for (const status of [401, 429, 500]) {
    it(`preserves HTTP ${status} failures from the quotation API`, async () => {
      const originalConsoleError = console.error;
      console.error = () => {};
      try {
        await assert.rejects(
          () => getQuotation({
            ...quoteInput,
            env,
            cityInfo,
            fetchImpl: async () => fakeResponse(status, { message: `provider-${status}` }),
          }),
          error => error instanceof LalamoveError && error.status === status,
        );
      } finally {
        console.error = originalConsoleError;
      }
    });
  }
});
