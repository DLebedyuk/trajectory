import { describe, expect, it } from 'vitest';
import { buildTripTagSet, pickChecklistCandidates, type TripContext } from '../travelChecklist.js';

const baseCtx: TripContext = {
  durationDays: 6,
  purposes: [],
  transport: [],
  seaOrPool: false,
  needsLaptop: false,
  activeOutdoor: false,
  canLaundry: false,
  specialEvent: false,
};

describe('buildTripTagSet', () => {
  it('всегда включает always', () => {
    expect(buildTripTagSet(baseCtx).has('always')).toBe(true);
  });

  it('короткая поездка получает shortTrip, длинная — longTrip', () => {
    expect(buildTripTagSet({ ...baseCtx, durationDays: 3 }).has('shortTrip')).toBe(true);
    expect(buildTripTagSet({ ...baseCtx, durationDays: 10 }).has('longTrip')).toBe(true);
    const mid = buildTripTagSet({ ...baseCtx, durationDays: 6 });
    expect(mid.has('shortTrip')).toBe(false);
    expect(mid.has('longTrip')).toBe(false);
  });

  it('транспорт и цель поездки становятся тегами', () => {
    const tags = buildTripTagSet({ ...baseCtx, transport: ['plane'], purposes: ['work'] });
    expect(tags.has('plane')).toBe(true);
    expect(tags.has('work')).toBe(true);
  });

  it('море/бассейн даёт тег sea', () => {
    expect(buildTripTagSet({ ...baseCtx, seaOrPool: true }).has('sea')).toBe(true);
  });
});

describe('pickChecklistCandidates', () => {
  const items = [
    { id: 'passport', tags: [], alwaysInclude: true, archived: false },
    { id: 'swimsuit', tags: ['sea'], alwaysInclude: false, archived: false },
    { id: 'umbrella', tags: ['rain'], alwaysInclude: false, archived: false },
    { id: 'archived-always', tags: [], alwaysInclude: true, archived: true },
  ];

  it('добавляет always-вещи независимо от тегов', () => {
    const picked = pickChecklistCandidates(items, new Set(['always']));
    expect(picked.map((i) => i.id)).toContain('passport');
  });

  it('добавляет вещи с пересекающимся тегом', () => {
    const picked = pickChecklistCandidates(items, new Set(['always', 'sea']));
    expect(picked.map((i) => i.id)).toEqual(expect.arrayContaining(['passport', 'swimsuit']));
    expect(picked.map((i) => i.id)).not.toContain('umbrella');
  });

  it('не берёт архивные вещи, даже always-вещи', () => {
    const picked = pickChecklistCandidates(items, new Set(['always']));
    expect(picked.map((i) => i.id)).not.toContain('archived-always');
  });
});
