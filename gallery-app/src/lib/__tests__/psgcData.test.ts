// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const root = new URL('../../../public/data/psgc-2026-q2/', import.meta.url);
type Place = { code: string; name: string };
type Region = { provinces: Place[]; cities: (Place & { provinceCode: string | null })[]; barangays: (Place & { cityCode: string })[] };
const read = <T,>(name: string): T => JSON.parse(readFileSync(new URL(`${name}.json`, root), 'utf8'));
describe('bundled June 2026 PSGC', () => {
  it('has official nationwide totals, valid relationships and intact names', () => {
    const regions = read<Place[]>('regions');
    expect(regions).toHaveLength(18);
    const data = regions.map(r => read<Region>(r.code));
    expect(data.flatMap(d => d.provinces)).toHaveLength(82);
    expect(data.flatMap(d => d.cities)).toHaveLength(1642);
    expect(data.flatMap(d => d.barangays)).toHaveLength(42010);
    for (const d of data) {
      const provinces = new Set(d.provinces.map(p => p.code));
      const cities = new Set(d.cities.map(c => c.code));
      expect(d.cities.every(c => c.provinceCode === null || provinces.has(c.provinceCode))).toBe(true);
      expect(d.barangays.every(b => cities.has(b.cityCode))).toBe(true);
      expect(JSON.stringify(d)).not.toContain('\uFFFD');
    }
    const ncr = read<Region>('1300000000');
    expect(ncr.provinces).toEqual([]);
    expect(ncr.cities.some(c => c.name === 'City of Las Piñas')).toBe(true);
    expect(ncr.barangays.filter(b => b.cityCode === '1380600000').length).toBeGreaterThan(800);
    const zamboanga = read<Region>('0900000000');
    expect(zamboanga.cities.find(c => c.name.includes('Isabela'))?.provinceCode).toBeNull();
  });
});
