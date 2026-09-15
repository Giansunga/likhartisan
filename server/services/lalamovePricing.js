const PUBLISHED_REMARKS = 'Fare can vary with traffic, order volume, delivery-partner availability, tolls, and surcharges. The final amount may be higher or lower and can change when order details change; use the live Lalamove quotation for checkout.';
const HIGH_DEMAND_SURCHARGE = 'High-demand surcharge: up to 300%.';

const MANILA_LOADING_UNLOADING = Object.freeze({
  MOTORCYCLE: Object.freeze({ includedMinutesPerStop: 30, excessPhpPerHour: 60 }),
  SEDAN: Object.freeze({ includedMinutesPerStop: 30, excessPhpPerHour: 100 }),
  MPV: Object.freeze({ includedMinutesPerStop: 30, excessPhpPerHour: 150 }),
  '600KG_MPV': Object.freeze({ includedMinutesPerStop: 30, excessPhpPerHour: 150 }),
  PICKUP_800KG_INTERCITY: Object.freeze({ includedMinutesPerStop: 30, excessPhpPerHour: 150 }),
  VAN1000: Object.freeze({ includedMinutesPerStop: 60, excessPhpPerHour: 150 }),
  '2000KG_FB': Object.freeze({ includedMinutesPerStop: 60, excessPhpPerHour: 200 }),
  '2000KG_ALUMINUM': Object.freeze({ includedMinutesPerStop: 60, excessPhpPerHour: 200 }),
  '3000KG_TRUCK': Object.freeze({ includedMinutesPerStop: 90, excessPhpPerHour: 250 }),
  TRUCK550: Object.freeze({ includedMinutesPerStop: 90, excessPhpPerHour: 250 }),
  '7000KG_TRUCK': Object.freeze({ includedMinutesPerStop: 120, excessPhpPerHour: 250 }),
  '10WHEEL_TRUCK': Object.freeze({ includedMinutesPerStop: 180, excessPhpPerHour: 250 }),
});

const STANDARD_HELPER_FEES = Object.freeze([
  Object.freeze({ description: 'Up to 25 kg by driver for each stop', feePhp: 80 }),
  Object.freeze({ description: 'Up to 2 stops by extra helper', feePhp: 200 }),
  Object.freeze({ description: 'Up to 4 stops by extra helper', feePhp: 300 }),
  Object.freeze({ description: 'More than 4 stops by extra helper', feePhp: 450 }),
]);

const HEAVY_HELPER_FEES = Object.freeze([
  Object.freeze({ description: 'Up to first stop by extra helper', feePhp: 0 }),
  Object.freeze({ description: 'Up to 2 stops by extra helper', feePhp: 400 }),
  Object.freeze({ description: 'Up to 4 stops by extra helper', feePhp: 450 }),
  Object.freeze({ description: 'More than 4 stops by extra helper', feePhp: 600 }),
]);

const MANILA_ADDITIONAL_SERVICES = Object.freeze({
  MOTORCYCLE: Object.freeze({
    cashOnDelivery: Object.freeze({ maxOrderPhp: 2000, feePhp: 30 }),
    thermalBagPhp: 0,
    extraWaitingTimePhp: 70,
    buyForMe: Object.freeze({ maxOrderPhp: 2000, feePhp: 70 }),
  }),
  SEDAN: Object.freeze({
    documentHandlingPhp: 50,
    roundTripSurchargePercent: 90,
    doorToDoor: Object.freeze({ driverLoadingKg: 25, driverFeePhp: 80 }),
    buyForMe: Object.freeze({ maxOrderPhp: 5000, feePhp: 100 }),
  }),
  MPV: Object.freeze({
    documentHandlingPhp: 50,
    roundTripSurchargePercent: 90,
    buyForMe: Object.freeze({ maxOrderPhp: 5000, feePhp: 100 }),
    doorToDoor: Object.freeze({ helperFees: STANDARD_HELPER_FEES }),
  }),
  '600KG_MPV': Object.freeze({
    documentHandlingPhp: 50,
    roundTripSurchargePercent: 70,
    doorToDoor: Object.freeze({ helperFees: STANDARD_HELPER_FEES }),
  }),
  PICKUP_800KG_INTERCITY: Object.freeze({
    documentHandlingPhp: 50,
    roundTripSurchargePercent: 70,
    doorToDoor: Object.freeze({ helperFees: STANDARD_HELPER_FEES }),
  }),
  VAN1000: Object.freeze({
    documentHandlingPhp: 50,
    roundTripSurchargePercent: 70,
    doorToDoor: Object.freeze({ helperFees: STANDARD_HELPER_FEES }),
  }),
  '2000KG_FB': Object.freeze({
    documentHandlingPhp: 50,
    roundTripSurchargePercent: 70,
    doorToDoor: Object.freeze({ helperFees: Object.freeze([
      Object.freeze({ description: 'Up to first stop by extra helper', feePhp: 0 }),
      Object.freeze({ description: 'Up to 2 stops by extra helper', feePhp: 200 }),
      Object.freeze({ description: 'Up to 4 stops by extra helper', feePhp: 300 }),
      Object.freeze({ description: 'More than 4 stops by extra helper', feePhp: 450 }),
    ]) }),
  }),
  '2000KG_ALUMINUM': Object.freeze({
    documentHandlingPhp: 50,
    roundTripSurchargePercent: 70,
    doorToDoor: Object.freeze({ helperFees: Object.freeze([
      Object.freeze({ description: 'Up to first stop by extra helper', feePhp: 0 }),
      Object.freeze({ description: 'Up to 2 stops by extra helper', feePhp: 200 }),
      Object.freeze({ description: 'Up to 4 stops by extra helper', feePhp: 300 }),
      Object.freeze({ description: 'More than 4 stops by extra helper', feePhp: 450 }),
    ]) }),
  }),
  '3000KG_TRUCK': Object.freeze({
    documentHandlingPhp: 80,
    roundTripSurchargePercent: 70,
    doorToDoor: Object.freeze({ helperFees: HEAVY_HELPER_FEES }),
  }),
  TRUCK550: Object.freeze({
    documentHandlingPhp: 80,
    roundTripSurchargePercent: 70,
    doorToDoor: Object.freeze({ helperFees: HEAVY_HELPER_FEES }),
  }),
  '7000KG_TRUCK': Object.freeze({
    documentHandlingPhp: 80,
    roundTripSurchargePercent: 70,
    doorToDoor: Object.freeze({ helperFees: HEAVY_HELPER_FEES }),
  }),
  '10WHEEL_TRUCK': Object.freeze({
    documentHandlingPhp: 80,
    roundTripSurchargePercent: 70,
    doorToDoor: Object.freeze({ helperFees: HEAVY_HELPER_FEES }),
  }),
});

export const LALAMOVE_PRICING_URLS = Object.freeze({
  'manila-ncr-and-south-luzon': 'https://www.lalamove.com/en-ph/all-delivery-pricing-detail?city=manila-ncr-and-south-luzon',
  'cebu-islandwide': 'https://www.lalamove.com/en-ph/all-delivery-pricing-detail?city=cebu-islandwide',
});

function card({
  serviceType,
  type,
  types = 'N/A',
  regularDeliveryFee,
  addStopPhp,
  weightLimitKg,
  sizeLimitCm,
  suitableFor,
  regularLongDistanceDeliveryFee = null,
  longDistanceDestination = null,
  tenHourRentalFee = null,
  loadingUnloading = null,
  additionalServices = null,
  surcharge = HIGH_DEMAND_SURCHARGE,
}) {
  return Object.freeze({
    serviceType,
    type,
    types,
    regularDeliveryFee,
    addStopPhp,
    weightLimitKg,
    sizeLimitCm: Object.freeze(sizeLimitCm),
    sizeLimitMeters: `${sizeLimitCm[0] / 100} x ${sizeLimitCm[1] / 100} x ${sizeLimitCm[2] / 100} meters`,
    suitableFor,
    regularLongDistanceDeliveryFee,
    longDistanceDestination,
    tenHourRentalFee,
    loadingUnloading,
    additionalServices,
    surcharge,
    remarks: PUBLISHED_REMARKS,
  });
}

const manila = [
  card({
    serviceType: 'MOTORCYCLE', type: 'Motorcycle', types: 'N/A',
    regularDeliveryFee: { basePhp: 49, tiers: [{ upToKm: 5, perKmPhp: 6 }, { aboveKm: 5, perKmPhp: 5 }] },
    addStopPhp: 40, weightLimitKg: 20, sizeLimitCm: [50, 40, 50],
    suitableFor: 'Small pottery and documents.',
  }),
  card({
    serviceType: 'SEDAN', type: 'Sedan', types: 'Hatchback/Sedan',
    regularDeliveryFee: { basePhp: 100, tiers: [{ upToKm: 5, perKmPhp: 18 }, { aboveKm: 5, perKmPhp: 15 }] },
    addStopPhp: 45, weightLimitKg: 200, sizeLimitCm: [100, 60, 70],
    suitableFor: 'Small to medium pottery orders.',
    regularLongDistanceDeliveryFee: { basePhp: 715, includedDistanceKm: 50, tiers: [{ fromKm: 41, toKm: 60, perKmPhp: 2 }, { aboveKm: 60, perKmPhp: 15 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: 'MPV', type: 'Small Crossover / SUV', types: 'Subcompact SUV / Crossover',
    regularDeliveryFee: { basePhp: 115, tiers: [{ fromKm: 1, toKm: 30, perKmPhp: 20 }, { fromKm: 31, toKm: 40, perKmPhp: 17 }] },
    addStopPhp: 45, weightLimitKg: 300, sizeLimitCm: [120, 100, 90],
    suitableFor: 'Larger pottery orders and fragile pieces.',
    regularLongDistanceDeliveryFee: { basePhp: 885, includedDistanceKm: 50, tiers: [{ fromKm: 41, toKm: 60, perKmPhp: 2 }, { aboveKm: 60, perKmPhp: 17 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: '600KG_MPV', type: '600kg 7-Seater SUV / Minivan', types: '7-seater SUV / Small Van',
    regularDeliveryFee: { basePhp: 200, tiers: [{ fromKm: 1, toKm: 30, perKmPhp: 20 }, { fromKm: 31, toKm: 40, perKmPhp: 17 }] },
    addStopPhp: 50, weightLimitKg: 600, sizeLimitCm: [210, 120, 110],
    suitableFor: 'Bulky pottery orders up to 600 kg.',
    regularLongDistanceDeliveryFee: { basePhp: 970, includedDistanceKm: 50, tiers: [{ fromKm: 41, toKm: 60, perKmPhp: 2 }, { aboveKm: 60, perKmPhp: 17 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: 'PICKUP_800KG_INTERCITY', type: '800kg Pickup', types: 'Pickup',
    regularDeliveryFee: { basePhp: 240, tiers: [{ perKmPhp: 20 }] },
    addStopPhp: 50, weightLimitKg: 800, sizeLimitCm: [270, 150, 50],
    suitableFor: 'Long, wide, or heavy pottery orders.',
    regularLongDistanceDeliveryFee: { basePhp: 1040, includedDistanceKm: 50, tiers: [{ fromKm: 40, toKm: 60, perKmPhp: 2 }, { aboveKm: 60, perKmPhp: 17 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: 'VAN1000', type: '1000kg L300 / Cargo Van', types: 'L300 / Cargo Van',
    tenHourRentalFee: { fullDayPhp: 3500, extraHourPhp: 200 },
    regularDeliveryFee: { basePhp: 280, tiers: [{ perKmPhp: 20 }] },
    addStopPhp: 100, weightLimitKg: 1000, sizeLimitCm: [210, 120, 120],
    suitableFor: 'Large pottery orders and cargo.',
    regularLongDistanceDeliveryFee: { basePhp: 1080, includedDistanceKm: 50, tiers: [{ fromKm: 41, toKm: 60, perKmPhp: 2 }, { aboveKm: 60, perKmPhp: 18 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: '2000KG_FB', type: '2000kg FB Long Van', types: 'FB',
    regularDeliveryFee: { basePhp: 900, tiers: [{ perKmPhp: 26 }] },
    addStopPhp: 255, weightLimitKg: 2000, sizeLimitCm: [300, 170, 170],
    suitableFor: 'Very large commercial pottery orders.',
    regularLongDistanceDeliveryFee: { basePhp: 1780, includedDistanceKm: 50, tiers: [{ fromKm: 40, toKm: 60, perKmPhp: 5 }, { aboveKm: 60, perKmPhp: 26 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: '2000KG_ALUMINUM', type: '2000kg Aluminum Van', types: 'Aluminum',
    regularDeliveryFee: { basePhp: 1040, tiers: [{ perKmPhp: 29 }] },
    addStopPhp: 255, weightLimitKg: 2000, sizeLimitCm: [300, 170, 170],
    suitableFor: 'Very large commercial pottery orders.',
    regularLongDistanceDeliveryFee: { basePhp: 2200, includedDistanceKm: 50, tiers: [{ fromKm: 40, toKm: 53, perKmPhp: 5 }, { aboveKm: 53, perKmPhp: 26 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: '3000KG_TRUCK', type: '3000kg 6W Aluminum Truck', types: 'Aluminum',
    tenHourRentalFee: { fullDayPhp: 7000, extraHourPhp: 500 },
    regularDeliveryFee: { basePhp: 1450, tiers: [{ perKmPhp: 33 }] },
    addStopPhp: 255, weightLimitKg: 3000, sizeLimitCm: [430, 180, 210],
    suitableFor: 'Industrial-scale pottery orders.',
    regularLongDistanceDeliveryFee: { basePhp: 2770, includedDistanceKm: 50, tiers: [{ fromKm: 40, toKm: 53, perKmPhp: 5 }, { aboveKm: 53, perKmPhp: 33 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: 'TRUCK550', type: '5000kg 6W Large Aluminum Truck', types: 'Aluminum',
    regularDeliveryFee: { basePhp: 2694, tiers: [{ perKmPhp: 34 }] },
    addStopPhp: 255, weightLimitKg: 5000, sizeLimitCm: [480, 200, 210],
    suitableFor: 'Large commercial and wholesale orders.',
    regularLongDistanceDeliveryFee: { basePhp: 4595, includedDistanceKm: 50, tiers: [{ aboveKm: 40, perKmPhp: 44 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: '7000KG_TRUCK', type: '7000kg 6W FWD Aluminum Truck', types: 'Aluminum',
    tenHourRentalFee: { fullDayPhp: 9000, extraHourPhp: 200 },
    regularDeliveryFee: { basePhp: 4420, tiers: [{ perKmPhp: 50 }] },
    addStopPhp: 500, weightLimitKg: 7000, sizeLimitCm: [550, 180, 250],
    suitableFor: 'Extra-large commercial orders.',
    regularLongDistanceDeliveryFee: { basePhp: 6420, includedDistanceKm: 50, tiers: [{ aboveKm: 40, perKmPhp: 50 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: '10WHEEL_TRUCK', type: '12000kg 10W Wing Van', types: 'Aluminum / Wing Van',
    tenHourRentalFee: { fullDayPhp: 12000, extraHourPhp: 500 },
    regularDeliveryFee: { basePhp: 7200, tiers: [{ perKmPhp: 85 }] },
    addStopPhp: 800, weightLimitKg: 12000, sizeLimitCm: [1000, 240, 230],
    suitableFor: 'Warehouse-scale commercial orders.',
    regularLongDistanceDeliveryFee: { basePhp: 10600, includedDistanceKm: 50, tiers: [{ fromKm: 40, toKm: 199, perKmPhp: 65 }, { fromKm: 200, toKm: 299, perKmPhp: 60 }, { aboveKm: 299, perKmPhp: 50 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
].map(entry => Object.freeze({
  ...entry,
  loadingUnloading: MANILA_LOADING_UNLOADING[entry.serviceType] || null,
  additionalServices: MANILA_ADDITIONAL_SERVICES[entry.serviceType] || null,
}));

const cebu = [
  card({
    serviceType: 'MOTORCYCLE', type: 'Motorcycle', types: '-',
    regularDeliveryFee: { basePhp: 50, tiers: [{ upToKm: 2, perKmPhp: 0 }, { fromKm: 2, toKm: 9, perKmPhp: 6 }, { aboveKm: 9, perKmPhp: 5 }] },
    addStopPhp: 40, weightLimitKg: 20, sizeLimitCm: [50, 40, 50],
    suitableFor: 'Small pottery and documents.',
  }),
  card({
    serviceType: 'SIDECAR', type: '3-Wheel Sidecar', types: 'Motorcycle with Sidecar',
    regularDeliveryFee: { basePhp: 55, tiers: [{ perKmPhp: 9 }] },
    addStopPhp: 40, weightLimitKg: 100, sizeLimitCm: [180, 120, 60],
    suitableFor: 'Small to medium pottery orders.',
  }),
  card({
    serviceType: 'SEDAN', type: 'Sedan', types: 'Hatchback/Sedan',
    regularDeliveryFee: { basePhp: 114, tiers: [{ fromKm: 2, toKm: 9, perKmPhp: 14 }, { aboveKm: 9, perKmPhp: 12 }] },
    addStopPhp: 45, weightLimitKg: 200, sizeLimitCm: [100, 60, 70],
    suitableFor: 'Small to medium pottery orders.',
    regularLongDistanceDeliveryFee: { basePhp: 584, includedDistanceKm: 40, tiers: [{ aboveKm: 40, perKmPhp: 6 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: 'MPV', type: 'SUV', types: 'Subcompact SUV / Crossover',
    regularDeliveryFee: { basePhp: 128, tiers: [{ fromKm: 2, toKm: 9, perKmPhp: 16 }, { aboveKm: 9, perKmPhp: 13 }] },
    addStopPhp: 45, weightLimitKg: 300, sizeLimitCm: [120, 100, 90],
    suitableFor: 'Larger pottery orders and fragile pieces.',
    regularLongDistanceDeliveryFee: { basePhp: 654, includedDistanceKm: 40, tiers: [{ aboveKm: 40, perKmPhp: 7 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: '600KG_MPV', type: '600kg 7-Seater SUV / Minivan', types: '7-seater SUV / Small Van',
    regularDeliveryFee: { basePhp: 171, tiers: [{ upToKm: 9, perKmPhp: 14 }, { aboveKm: 9, perKmPhp: 12 }] },
    addStopPhp: 50, weightLimitKg: 600, sizeLimitCm: [200, 150, 120],
    suitableFor: 'Bulky pottery orders up to 600 kg.',
    regularLongDistanceDeliveryFee: { basePhp: 655, includedDistanceKm: 40, tiers: [{ aboveKm: 40, perKmPhp: 8 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: 'PICKUP_600KG', type: '600kg Pickup', types: 'Pickup',
    regularDeliveryFee: { basePhp: 190, tiers: [{ upToKm: 9, perKmPhp: 15 }, { aboveKm: 9, perKmPhp: 13 }] },
    addStopPhp: 50, weightLimitKg: 600, sizeLimitCm: [200, 150, 50],
    suitableFor: 'Long, wide, or heavy pottery orders.',
    regularLongDistanceDeliveryFee: { basePhp: 728, includedDistanceKm: 40, tiers: [{ aboveKm: 40, perKmPhp: 9 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: 'VAN1000', type: '1000kg L300 / Cargo Van', types: 'L300 / Cargo Van',
    regularDeliveryFee: { basePhp: 266, tiers: [{ upToKm: 9, perKmPhp: 21 }, { aboveKm: 9, perKmPhp: 18 }] },
    addStopPhp: 100, weightLimitKg: 1000, sizeLimitCm: [210, 120, 120],
    suitableFor: 'Large pottery orders and cargo.',
    regularLongDistanceDeliveryFee: { basePhp: 1019, includedDistanceKm: 40, tiers: [{ aboveKm: 40, perKmPhp: 13 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
  card({
    serviceType: '2000KG_FB', type: '2000kg FB Long Van', types: 'FB',
    regularDeliveryFee: { basePhp: 903, tiers: [{ upToKm: 9, perKmPhp: 23 }, { aboveKm: 9, perKmPhp: 21 }] },
    addStopPhp: 255, weightLimitKg: 2000, sizeLimitCm: [200, 170, 170],
    suitableFor: 'Very large commercial pottery orders.',
    regularLongDistanceDeliveryFee: { basePhp: 1585, includedDistanceKm: 40, tiers: [{ aboveKm: 40, perKmPhp: 11 }] },
    longDistanceDestination: 'Outside the regular delivery area; confirm the destination in Lalamove.',
  }),
];

export const LALAMOVE_RATE_CARDS = Object.freeze({
  'manila-ncr-and-south-luzon': Object.freeze(manila),
  'cebu-islandwide': Object.freeze(cebu),
});

export function getPublishedVehiclePricing(serviceType, region = 'manila-ncr-and-south-luzon') {
  const cards = LALAMOVE_RATE_CARDS[region] || LALAMOVE_RATE_CARDS['manila-ncr-and-south-luzon'];
  return cards.find(cardEntry => cardEntry.serviceType === serviceType) || null;
}
