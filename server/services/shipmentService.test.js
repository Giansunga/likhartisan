import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateShipment,
  createShipmentFingerprint,
  getShipmentConfig,
  resolveShippingWeightGrams,
  ShipmentDataError,
  SHIPPING_DEFAULTS,
  VEHICLE_GUIDE,
} from './shipmentService.js';
import { getPublishedVehiclePricing, LALAMOVE_RATE_CARDS } from './lalamovePricing.js';

const vehicles = [
  { serviceType: 'BIKE', label: 'Bike', maxL: 50, maxW: 40, maxH: 50, maxKg: 20 },
  { serviceType: 'VAN', label: 'Van', maxL: 210, maxW: 120, maxH: 120, maxKg: 1000 },
];

function item(overrides = {}) {
  return {
    productId: 'p1', productName: 'Test pot', variationId: null, quantity: 2,
    shipping_weight_g: 750, shipping_length_in: 8, shipping_width_in: 6, shipping_height_in: 5,
    ...overrides,
  };
}

test('sums authoritative integer grams and quantity', () => {
  const shipment = calculateShipment([item(), item({ productId: 'p2', quantity: 1, shipping_weight_g: 1250 })], { vehicles });
  assert.equal(shipment.totalWeightG, 2750);
  assert.equal(shipment.itemCount, 3);
  assert.equal(shipment.recommendedVehicle.serviceType, 'BIKE');
});

test('uses the existing variation kg weight when shipping grams are not populated', () => {
  const shipment = calculateShipment([{
    productName: 'Legacy vase',
    quantity: 1,
    weight_kg: 13.6,
    dimensions: '17 in x 16 in',
    height: '17 in',
  }]);

  assert.equal(shipment.totalWeightG, 13600);
});

test('accepts rotated packages without hidden packing inflation', () => {
  const shipment = calculateShipment([item({ shipping_length_in: 19, shipping_width_in: 15, shipping_height_in: 2 })], {
    packingFactor: 1,
    dimensionSafetyFactor: 1,
    weightSafetyFactor: 1,
    vehicles: [{ serviceType: 'ROTATED', label: 'Rotated', maxL: 50, maxW: 40, maxH: 20, maxKg: 20 }],
  });
  assert.deepEqual(shipment.largestPackageCm.map(value => Math.round(value)), [48, 38, 5]);
});

test('uses the published Pampanga vehicle limits and exact sizing defaults', () => {
  assert.equal(SHIPPING_DEFAULTS.packingFactor, 1);
  assert.equal(SHIPPING_DEFAULTS.weightSafetyFactor, 1);
  assert.equal(SHIPPING_DEFAULTS.dimensionSafetyFactor, 1);
  assert.deepEqual(VEHICLE_GUIDE.find(vehicle => vehicle.serviceType === 'MPV'), {
    serviceType: 'MPV', label: 'Subcompact SUV', maxL: 120, maxW: 100, maxH: 90, maxKg: 300,
  });
  assert.deepEqual(VEHICLE_GUIDE.find(vehicle => vehicle.serviceType === 'TRUCK550'), {
    serviceType: 'TRUCK550', label: '5-Ton Truck', maxL: 480, maxW: 200, maxH: 210, maxKg: 5000,
  });
  assert.equal(getShipmentConfig({}).pricingRegion, 'manila-ncr-and-south-luzon');
  assert.equal(getPublishedVehiclePricing('MOTORCYCLE').regularDeliveryFee.basePhp, 49);
  assert.equal(getPublishedVehiclePricing('MOTORCYCLE', 'cebu-islandwide').regularDeliveryFee.basePhp, 50);
  assert.equal(LALAMOVE_RATE_CARDS['manila-ncr-and-south-luzon'].length, 12);
  assert.deepEqual(getPublishedVehiclePricing('MOTORCYCLE').loadingUnloading, {
    includedMinutesPerStop: 30, excessPhpPerHour: 60,
  });
  assert.equal(getPublishedVehiclePricing('MOTORCYCLE').additionalServices.cashOnDelivery.feePhp, 30);
  assert.equal(getPublishedVehiclePricing('TRUCK550').additionalServices.documentHandlingPhp, 80);
  assert.deepEqual(getPublishedVehiclePricing('VAN1000').tenHourRentalFee, {
    fullDayPhp: 3500, extraHourPhp: 200,
  });
});

test('does not add a separate shipping-package weight', () => {
  assert.equal(resolveShippingWeightGrams({ product_weight_g: 13600, packaging_weight_g: 2500 }), 13600);
});

test('requires both weight and packed dimensions', () => {
  assert.throws(() => calculateShipment([item({ shipping_weight_g: null })], { vehicles }), ShipmentDataError);
  assert.throws(() => calculateShipment([item({ shipping_height_in: null })], { vehicles }), ShipmentDataError);
});

test('does not select a vehicle when weight or dimensions exceed it', () => {
  assert.throws(() => calculateShipment([item({ shipping_weight_g: 21000 })], { vehicles: [vehicles[0]] }), /too large/);
  assert.throws(() => calculateShipment([item({ shipping_length_in: 30, shipping_width_in: 30, shipping_height_in: 30 })], { vehicles: [vehicles[0]] }), /too large/);
});

test('fingerprint changes when quantity or route changes', () => {
  const shipment = calculateShipment([item()], { vehicles });
  const base = { items: [item()], shipment, pickupCoords: { lat: 15, lng: 120 }, dropoffCoords: { lat: 15.1, lng: 120.1 } };
  assert.notEqual(createShipmentFingerprint(base), createShipmentFingerprint({ ...base, items: [item({ quantity: 3 })] }));
  assert.notEqual(createShipmentFingerprint(base), createShipmentFingerprint({ ...base, dropoffCoords: { lat: 15.2, lng: 120.2 } }));
});
