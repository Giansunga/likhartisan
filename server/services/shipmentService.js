import crypto from 'node:crypto';
import { getPublishedVehiclePricing } from './lalamovePricing.js';

export const SHIPPING_DEFAULTS = Object.freeze({
  // Pampanga is covered by Lalamove's Manila/NCR & South Luzon pricing area.
  pricingRegion: 'manila-ncr-and-south-luzon',
  packingFactor: 1,
  weightSafetyFactor: 1,
  dimensionSafetyFactor: 1,
});

export function getShipmentConfig(env = process.env) {
  return {
    pricingRegion: String(env.LALAMOVE_PRICING_REGION || SHIPPING_DEFAULTS.pricingRegion).trim().toLowerCase(),
    packingFactor: Number(env.LALAMOVE_PACKING_FACTOR) || SHIPPING_DEFAULTS.packingFactor,
    weightSafetyFactor: Number(env.LALAMOVE_WEIGHT_SAFETY_FACTOR) || SHIPPING_DEFAULTS.weightSafetyFactor,
    dimensionSafetyFactor: Number(env.LALAMOVE_DIMENSION_SAFETY_FACTOR) || SHIPPING_DEFAULTS.dimensionSafetyFactor,
  };
}

// These are the physical limits used to choose a vehicle. serviceType values
// are the exact keys returned by Lalamove's PH /v3/cities response.
export const VEHICLE_GUIDE = Object.freeze([
  { serviceType: 'MOTORCYCLE', label: 'Motorcycle', maxL: 50, maxW: 40, maxH: 50, maxKg: 20 },
  { serviceType: 'SEDAN', label: 'Sedan', maxL: 100, maxW: 60, maxH: 70, maxKg: 200 },
  { serviceType: 'MPV', label: 'Subcompact SUV', maxL: 120, maxW: 100, maxH: 90, maxKg: 300 },
  { serviceType: '600KG_MPV', label: '7-Seater SUV / Small Van', maxL: 210, maxW: 120, maxH: 110, maxKg: 600 },
  { serviceType: 'PICKUP_800KG_INTERCITY', label: 'Pickup', maxL: 270, maxW: 150, maxH: 50, maxKg: 800 },
  { serviceType: 'VAN1000', label: 'L300 / Cargo Van', maxL: 210, maxW: 120, maxH: 120, maxKg: 1000 },
  { serviceType: '2000KG_FB', label: 'FB Van', maxL: 300, maxW: 170, maxH: 170, maxKg: 2000 },
  { serviceType: '3000KG_TRUCK', label: '3-Ton Truck', maxL: 430, maxW: 180, maxH: 210, maxKg: 3000 },
  { serviceType: 'TRUCK550', label: '5-Ton Truck', maxL: 480, maxW: 200, maxH: 210, maxKg: 5000 },
  { serviceType: '7000KG_TRUCK', label: '7-Ton Truck', maxL: 550, maxW: 180, maxH: 250, maxKg: 7000 },
  { serviceType: '10WHEEL_TRUCK', label: '10-Wheel Truck', maxL: 1000, maxW: 240, maxH: 230, maxKg: 12000 },
]);

export class ShipmentDataError extends Error {
  constructor(message, { code = 'ERR_SHIPPING_DATA_INCOMPLETE', productName = null, field = null, status = 422 } = {}) {
    super(message);
    this.name = 'ShipmentDataError';
    this.code = code;
    this.productName = productName;
    this.field = field;
    this.status = status;
  }
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function measurementNumbers(value) {
  if (value == null) return [];
  return String(value).match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
}

function parseInches(value, unit = 'in') {
  const number = positiveNumber(value);
  if (number != null) return number;
  const first = measurementNumbers(value)[0];
  if (!positiveNumber(first)) return null;
  return /cm|centimeter/i.test(String(value)) ? first / 2.54 : unit === 'cm' ? first / 2.54 : first;
}

export function parsePackedDimensionsInches(source = {}) {
  const explicit = [source.shipping_length_in, source.shipping_width_in, source.shipping_height_in]
    .map(value => parseInches(value, 'in'));
  if (explicit.every(value => value != null)) return explicit;

  const dimensions = measurementNumbers(source.dimensions);
  const length = parseInches(dimensions[0], source.measurement_unit);
  const width = parseInches(dimensions[1] ?? dimensions[0], source.measurement_unit);
  const height = parseInches(source.height, source.measurement_unit);
  return [length, width, height];
}

export function resolveShippingWeightGrams(source = {}) {
  const explicit = positiveInteger(source.shipping_weight_g);
  if (explicit != null) return explicit;
  // Existing catalog variations store the item's weight as kg. Keep that
  // value usable while artisans gradually fill the authoritative gram fields.
  const legacyProductWeight = positiveNumber(source.weight_kg);
  const product = positiveInteger(source.product_weight_g)
    || (legacyProductWeight == null ? 0 : Math.round(legacyProductWeight * 1000));
  // Pampanga artisans ship the actual pottery without a separately measured
  // shipping-package weight. Keep the legacy field readable, but do not add
  // it to the authoritative product weight.
  return product > 0 ? product : null;
}

function sortedDimensions(values) {
  return [...values].sort((a, b) => b - a);
}

function lineData(line, index) {
  const productName = line.productName || line.name || `Item ${index + 1}`;
  const quantity = positiveInteger(line.quantity ?? line.qty);
  if (!quantity) {
    throw new ShipmentDataError(`${productName} has an invalid quantity.`, { productName, field: 'quantity' });
  }

  const weightG = resolveShippingWeightGrams(line);
  if (!weightG) {
    throw new ShipmentDataError(`Product weight is incomplete for ${productName}. Ask the artisan to add the product weight.`, {
      productName,
      field: 'shipping_weight_g',
    });
  }

  const dimensionsIn = parsePackedDimensionsInches(line);
  if (dimensionsIn.some(value => value == null)) {
    throw new ShipmentDataError(`Product dimensions are incomplete for ${productName}. Ask the artisan to add length, width, and height.`, {
      productName,
      field: 'shipping_dimensions',
    });
  }

  return { productName, quantity, weightG, dimensionsIn };
}

function vehicleFits(vehicle, shipment, config) {
  const vehicleDimensions = [vehicle.maxL, vehicle.maxW, vehicle.maxH];
  const largest = shipment.largestPackageCm;
  const dimensionalCapacity = sortedDimensions(vehicleDimensions).map(value => value * config.dimensionSafetyFactor);
  const weightCapacityG = vehicle.maxKg * 1000 * config.weightSafetyFactor;
  const volumeCapacity = vehicle.maxL * vehicle.maxW * vehicle.maxH * config.dimensionSafetyFactor ** 3;
  return shipment.totalWeightG <= weightCapacityG
    && largest.every((value, index) => value <= dimensionalCapacity[index])
    && shipment.totalVolumeCm3 <= volumeCapacity;
}

export function calculateShipment(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ShipmentDataError('At least one item is required to calculate shipping.', { field: 'items' });
  }
  const config = {
    pricingRegion: String(options.pricingRegion || SHIPPING_DEFAULTS.pricingRegion).trim().toLowerCase(),
    packingFactor: positiveNumber(options.packingFactor) || SHIPPING_DEFAULTS.packingFactor,
    weightSafetyFactor: positiveNumber(options.weightSafetyFactor) || SHIPPING_DEFAULTS.weightSafetyFactor,
    dimensionSafetyFactor: positiveNumber(options.dimensionSafetyFactor) || SHIPPING_DEFAULTS.dimensionSafetyFactor,
    vehicles: options.vehicles || VEHICLE_GUIDE,
  };
  const lines = items.map(lineData);
  let totalWeightG = 0;
  let totalVolumeCm3 = 0;
  let itemCount = 0;
  let largestPackageCm = [0, 0, 0];

  for (const line of lines) {
    const dimensionsCm = line.dimensionsIn.map(value => value * 2.54);
    const packedScale = config.packingFactor ** (1 / 3);
    const packedDimensionsCm = sortedDimensions(dimensionsCm.map(value => value * packedScale));
    totalWeightG += line.weightG * line.quantity;
    totalVolumeCm3 += dimensionsCm.reduce((product, value) => product * value, 1) * line.quantity * config.packingFactor;
    itemCount += line.quantity;
    largestPackageCm = largestPackageCm.map((value, index) => Math.max(value, packedDimensionsCm[index]));
  }

  const recommendedVehicle = config.vehicles.find(vehicle => vehicleFits(vehicle, {
    totalWeightG,
    totalVolumeCm3,
    largestPackageCm,
  }, config));
  if (!recommendedVehicle) {
    throw new ShipmentDataError('This order is too large for the available delivery vehicles.', {
      code: 'ERR_SHIPMENT_TOO_LARGE',
      field: 'items',
    });
  }

  return {
    totalWeightG,
    totalWeightKg: totalWeightG / 1000,
    totalVolumeCm3,
    itemCount,
    largestPackageCm,
    recommendedVehicle,
    pricingReference: getPublishedVehiclePricing(recommendedVehicle.serviceType, config.pricingRegion),
    config,
  };
}

export function createShipmentFingerprint({ items, shipment, pickupCoords, dropoffCoords, serviceType }) {
  const canonical = {
    items: items.map(item => ({
      productId: item.productId,
      variationId: item.variationId || null,
      quantity: item.quantity ?? item.qty,
      shippingWeightG: resolveShippingWeightGrams(item),
      dimensionsIn: parsePackedDimensionsInches(item),
    })),
    pickupCoords: { lat: Number(pickupCoords?.lat), lng: Number(pickupCoords?.lng) },
    dropoffCoords: { lat: Number(dropoffCoords?.lat), lng: Number(dropoffCoords?.lng) },
    serviceType: serviceType || shipment?.recommendedVehicle?.serviceType || null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
