import {
  getLalamoveConfig,
  getQuotation,
  getCityInfo as fetchCityInfo,
  isValidCoordinates,
  listServiceTypes,
  mapLalamoveError,
} from '../services/lalamoveService.js';
import {
  calculateShipment,
  createShipmentFingerprint,
  getShipmentConfig,
  ShipmentDataError,
} from '../services/shipmentService.js';

const PRODUCT_SHIPPING_FIELDS = [
  'id', 'name', 'price', 'image', 'shop_id', 'shop_name', 'stock',
  'dimensions', 'height', 'opening_diameter', 'measurement_unit',
  'product_weight_g', 'packaging_weight_g', 'shipping_weight_g',
  'shipping_length_in', 'shipping_width_in', 'shipping_height_in',
].join(', ');

const VARIATION_SHIPPING_FIELDS = [
  'id', 'product_id', 'price', 'stock', 'dimensions', 'height',
  'opening_diameter', 'measurement_unit', 'weight_kg', 'product_weight_g',
  'packaging_weight_g', 'shipping_weight_g', 'shipping_length_in',
  'shipping_width_in', 'shipping_height_in',
].join(', ');

function isSchemaColumnError(error) {
  const message = error?.message || '';
  return Boolean(
    error?.code === 'PGRST204' ||
      error?.code === '42703' ||
      /column .* (does not exist|not found)|could not find .* column|schema cache/i.test(message),
  );
}

function shipmentSource(product, variation) {
  // A selected variation is its own sellable package. It must carry its own
  // shipping facts; silently borrowing the base product could underquote it.
  const source = variation || product;
  return {
    productId: product.id,
    variationId: variation?.id || null,
    productName: product.name,
    quantity: 0,
    dimensions: source.dimensions,
    height: source.height,
    measurement_unit: source.measurement_unit,
    weight_kg: source.weight_kg,
    shipping_weight_g: source.shipping_weight_g,
    product_weight_g: source.product_weight_g,
    packaging_weight_g: source.packaging_weight_g,
    shipping_length_in: source.shipping_length_in,
    shipping_width_in: source.shipping_width_in,
    shipping_height_in: source.shipping_height_in,
  };
}

async function loadAuthoritativeItems(req, requestedItems) {
  const supabase = req.app.locals.supabase;
  if (!supabase) {
    throw new ShipmentDataError('Courier shipping data is not configured on the server.', {
      code: 'ERR_SHIPPING_DATA_INCOMPLETE', status: 500,
    });
  }
  const normalizedItems = requestedItems.map(item => ({
    ...item,
    quantity: Number(item.quantity ?? item.qty),
  }));
  const productIds = [...new Set(normalizedItems.map(item => item.productId).filter(Boolean))];
  const variationIds = [...new Set(normalizedItems.map(item => item.variationId).filter(Boolean))];
  if (!productIds.length) throw new ShipmentDataError('Courier quote items are invalid.', { field: 'items' });

  const [{ data: products, error: productError }, { data: variations, error: variationError }] = await Promise.all([
    supabase.from('products').select(PRODUCT_SHIPPING_FIELDS).in('id', productIds),
    variationIds.length
      ? supabase.from('product_variations').select(VARIATION_SHIPPING_FIELDS).in('id', variationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productError || variationError) {
    const databaseError = productError || variationError;
    const missingFields = isSchemaColumnError(databaseError);
    throw new ShipmentDataError(
      missingFields
        ? 'Courier shipping fields are not available yet. Apply the courier shipping data database migration.'
        : 'Courier shipping data could not be loaded.',
      { code: missingFields ? 'ERR_SHIPPING_DATA_INCOMPLETE' : 'ERR_SHIPPING_DATA_UNAVAILABLE', status: missingFields ? 422 : 500 },
    );
  }
  const productMap = new Map((products || []).map(product => [product.id, product]));
  const variationMap = new Map((variations || []).map(variation => [variation.id, variation]));
  const shopIds = new Set();
  const lines = normalizedItems.map(item => {
    const product = productMap.get(item.productId);
    if (!product) throw new ShipmentDataError(`Product ${item.productId} was not found.`, { code: 'ERR_SHIPPING_DATA_UNAVAILABLE', status: 400 });
    const variation = item.variationId ? variationMap.get(item.variationId) : null;
    if (item.variationId && (!variation || variation.product_id !== product.id)) {
      throw new ShipmentDataError(`The selected variation for ${product.name} is no longer available.`, { code: 'ERR_SHIPPING_DATA_UNAVAILABLE', status: 400, productName: product.name });
    }
    if (product.shop_id) shopIds.add(product.shop_id);
    return { ...shipmentSource(product, variation), quantity: item.quantity };
  });
  if (shopIds.size > 1) {
    throw new ShipmentDataError('Courier checkout currently supports one artisan shop per shipment.', {
      code: 'ERR_MULTIPLE_SHOPS', status: 422,
    });
  }
  return { lines, products: productMap, variations: variationMap };
}

function distanceMeters(distance) {
  const value = Number(distance?.value);
  if (!Number.isFinite(value)) return null;
  return String(distance?.unit || '').toLowerCase().startsWith('km') ? Math.round(value * 1000) : Math.round(value);
}

export async function handleGetQuote(req, res) {
  try {
    const { pickupAddress, dropoffAddress, scheduleAt, pickupCoords, dropoffCoords, items } = req.body;

    if (!pickupAddress || !dropoffAddress) {
      return res.status(400).json({ error: 'pickupAddress and dropoffAddress are required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(422).json({ error: 'Courier quote items are required.', code: 'ERR_SHIPPING_DATA_INCOMPLETE' });
    }
    if (!isValidCoordinates(pickupCoords)) {
      return res.status(400).json({ error: 'A valid pickup location with finite lat/lng coordinates is required.' });
    }
    if (!isValidCoordinates(dropoffCoords)) {
      return res.status(400).json({ error: 'A valid delivery pin with finite lat/lng coordinates is required.' });
    }

    const { lines } = await loadAuthoritativeItems(req, items);
    const shipment = calculateShipment(lines, getShipmentConfig());
    const quotation = await getQuotation({
      pickupCoords,
      dropoffCoords,
      pickupAddress,
      dropoffAddress,
      serviceType: shipment.recommendedVehicle.serviceType,
      scheduleAt,
    });
    const fingerprint = createShipmentFingerprint({
      items: lines,
      shipment,
      pickupCoords,
      dropoffCoords,
      serviceType: quotation.serviceType,
    });

    res.status(201).json({
      quotationId: quotation.quotationId,
      serviceType: quotation.serviceType,
      priceBreakdown: quotation.priceBreakdown,
      currency: quotation.currency,
      distance: quotation.distance,
      distanceMeters: distanceMeters(quotation.distance),
      stops: quotation.stops,
      expiresAt: quotation.expiresAt,
      pickupCoords,
      dropoffCoords,
      shipment: {
        totalWeightG: shipment.totalWeightG,
        totalWeightKg: shipment.totalWeightKg,
        totalVolumeCm3: shipment.totalVolumeCm3,
        itemCount: shipment.itemCount,
        largestPackageCm: shipment.largestPackageCm,
        recommendedVehicle: shipment.recommendedVehicle,
        pricingReference: shipment.pricingReference,
        fingerprint,
      },
    });
  } catch (err) {
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    const response = {
      error: mapLalamoveError(err),
      code: err?.code || 'LALAMOVE_QUOTE_FAILED',
      requestId: err?.requestId || null,
    };
    if (process.env.NODE_ENV !== 'production') {
      response.details = {
        status: err?.status || null,
        message: err?.message || null,
        detail: err?.detail || null,
        errors: err?.errors || [],
      };
    }
    console.error('[lalamove] quote controller error', {
      status,
      code: response.code,
      requestId: response.requestId,
      details: response.details,
    });
    res.status(status).json(response);
  }
}

export async function handleGetCityInfo(req, res) {
  try {
    const cityInfo = await fetchCityInfo();
    res.json({
      market: getLalamoveConfig().market,
      cities: cityInfo,
      serviceTypes: listServiceTypes(cityInfo),
    });
  } catch (err) {
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    console.error('[lalamove] city info controller error', {
      status,
      code: err?.code || 'LALAMOVE_CITY_INFO_FAILED',
      requestId: err?.requestId || null,
      message: err?.message || null,
    });
    res.status(status).json({
      error: mapLalamoveError(err),
      code: err?.code || 'LALAMOVE_CITY_INFO_FAILED',
      requestId: err?.requestId || null,
    });
  }
}

export { loadAuthoritativeItems };
