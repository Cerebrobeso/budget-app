import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, AssetSnapshot } from '../../core/models';
import { PortfolioStore, ThemeService } from '../../core/stores';
import { PortfolioPage } from './portfolio-page';

function snap(date: string, value: number): AssetSnapshot {
  return { date, value };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    name: 'Conto',
    category: 'conto-corrente',
    snapshots: [],
    ...overrides,
  };
}

describe('PortfolioPage', () => {
  let store: {
    assets: ReturnType<typeof signal<Asset[]>>;
    totalSeries: ReturnType<typeof signal<AssetSnapshot[]>>;
    add: ReturnType<typeof vi.fn>;
    addSnapshot: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let page: PortfolioPage;

  beforeEach(() => {
    store = {
      assets: signal<Asset[]>([]),
      totalSeries: signal<AssetSnapshot[]>([]),
      add: vi.fn(),
      addSnapshot: vi.fn(),
      remove: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        PortfolioPage,
        { provide: PortfolioStore, useValue: store },
        { provide: ThemeService, useValue: { dark: signal(false) } },
      ],
    });
    page = TestBed.inject(PortfolioPage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('archivedAssets', () => {
    it('filters store.assets() to only archived: true', () => {
      const active = makeAsset({ id: 'a1', archived: false });
      const archived1 = makeAsset({ id: 'a2', archived: true });
      const archived2 = makeAsset({ id: 'a3', archived: true });
      store.assets.set([active, archived1, archived2]);

      expect(page.archivedAssets()).toEqual([archived1, archived2]);
    });

    it('returns an empty array when nothing is archived', () => {
      store.assets.set([makeAsset({ archived: false }), makeAsset({ id: 'a2' })]);
      expect(page.archivedAssets()).toEqual([]);
    });
  });

  describe('totalReturn', () => {
    it('returns null when fewer than 2 points fall in the [from, to] range', () => {
      store.totalSeries.set([snap('2026-01-01', 100)]);
      page.from.set('2026-01-01');
      page.to.set('2026-12-31');

      expect(page.totalReturn()).toBeNull();
    });

    it('returns null when the first value in range is zero (division by zero)', () => {
      store.totalSeries.set([snap('2026-01-01', 0), snap('2026-06-01', 100)]);
      page.from.set('2026-01-01');
      page.to.set('2026-12-31');

      expect(page.totalReturn()).toBeNull();
    });

    it('computes the percentage gain between the first and last snapshot in range', () => {
      store.totalSeries.set([snap('2026-01-01', 100), snap('2026-06-01', 150)]);
      page.from.set('2026-01-01');
      page.to.set('2026-12-31');

      expect(page.totalReturn()).toBe(50);
    });

    it('excludes snapshots outside the [from, to] range (inclusive bounds)', () => {
      store.totalSeries.set([
        snap('2025-01-01', 1000),
        snap('2026-01-01', 100),
        snap('2026-06-01', 150),
        snap('2027-01-01', 9999),
      ]);
      page.from.set('2026-01-01');
      page.to.set('2026-06-01');

      expect(page.totalReturn()).toBe(50);
    });
  });

  describe('saveAsset', () => {
    beforeEach(() => {
      page.assetCategory.set('conto-corrente');
      page.assetDate.set('2026-07-23');
    });

    it('does not call store.add when assetName is empty', () => {
      page.assetName.set('');
      page.assetValue.set(100);

      page.saveAsset();

      expect(store.add).not.toHaveBeenCalled();
    });

    it('does not call store.add when assetName is whitespace-only', () => {
      page.assetName.set('   ');
      page.assetValue.set(100);

      page.saveAsset();

      expect(store.add).not.toHaveBeenCalled();
    });

    it('does not call store.add when assetValue is null', () => {
      page.assetName.set('Conto');
      page.assetValue.set(null);

      page.saveAsset();

      expect(store.add).not.toHaveBeenCalled();
    });

    it('does not call store.add when assetValue is zero', () => {
      page.assetName.set('Conto');
      page.assetValue.set(0);

      page.saveAsset();

      expect(store.add).not.toHaveBeenCalled();
    });

    it('does not call store.add when assetValue is negative', () => {
      page.assetName.set('Conto');
      page.assetValue.set(-50);

      page.saveAsset();

      expect(store.add).not.toHaveBeenCalled();
    });

    it('calls store.add with the trimmed name and rounded snapshot value on valid input, then resets the form', () => {
      // saveAsset() calls store.add(...) and resets the form signals before it touches
      // this.assetDialog() — that viewChild is unresolved without a real component render,
      // so the dialog.close() call throws here. The dialog's own open/close behavior is
      // @spartan-ng/helm's responsibility (see house style), so we assert the real outcome
      // that happened first and let the expected throw propagate.
      page.assetName.set('  Conto Corrente  ');
      page.assetValue.set(123.456);

      expect(() => page.saveAsset()).toThrow();

      expect(store.add).toHaveBeenCalledWith({
        name: 'Conto Corrente',
        category: 'conto-corrente',
        snapshots: [{ date: '2026-07-23', value: 123.46 }],
      });
      expect(page.assetName()).toBe('');
      expect(page.assetValue()).toBeNull();
    });
  });

  describe('openSnapshot', () => {
    // openSnapshot() sets snapAsset/snapValue/snapDate before it touches this.snapDialog()
    // — that viewChild is unresolved without a real component render, so the dialog.open()
    // call throws here. Per house style the dialog itself is out of scope, so we assert the
    // real state that was set first and let the expected throw propagate.
    it('sets snapAsset, snapValue to the latest snapshot value, and snapDate to today', () => {
      vi.setSystemTime(new Date('2026-07-23T10:00:00'));
      const asset = makeAsset({ snapshots: [snap('2026-01-01', 100), snap('2026-06-01', 200)] });

      expect(() => page.openSnapshot(asset)).toThrow();

      expect(page.snapAsset()).toBe(asset);
      expect(page.snapValue()).toBe(200);
      expect(page.snapDate()).toBe('2026-07-23');
    });

    it('sets snapValue to null when the asset has no snapshots', () => {
      const asset = makeAsset({ snapshots: [] });

      expect(() => page.openSnapshot(asset)).toThrow();

      expect(page.snapAsset()).toBe(asset);
      expect(page.snapValue()).toBeNull();
    });
  });

  describe('saveSnapshot', () => {
    it('does not call store.addSnapshot when there is no snapAsset', () => {
      page.snapAsset.set(null);
      page.snapValue.set(100);
      page.snapDate.set('2026-07-23');

      page.saveSnapshot();

      expect(store.addSnapshot).not.toHaveBeenCalled();
    });

    it('does not call store.addSnapshot when snapValue is null', () => {
      page.snapAsset.set(makeAsset());
      page.snapValue.set(null);
      page.snapDate.set('2026-07-23');

      page.saveSnapshot();

      expect(store.addSnapshot).not.toHaveBeenCalled();
    });

    it('does not call store.addSnapshot when snapValue is zero', () => {
      page.snapAsset.set(makeAsset());
      page.snapValue.set(0);
      page.snapDate.set('2026-07-23');

      page.saveSnapshot();

      expect(store.addSnapshot).not.toHaveBeenCalled();
    });

    it('does not call store.addSnapshot when snapValue is negative', () => {
      page.snapAsset.set(makeAsset());
      page.snapValue.set(-10);
      page.snapDate.set('2026-07-23');

      page.saveSnapshot();

      expect(store.addSnapshot).not.toHaveBeenCalled();
    });

    it('does not call store.addSnapshot when snapDate is empty', () => {
      page.snapAsset.set(makeAsset());
      page.snapValue.set(100);
      page.snapDate.set('');

      page.saveSnapshot();

      expect(store.addSnapshot).not.toHaveBeenCalled();
    });

    it('calls store.addSnapshot with the rounded value on valid input', () => {
      // saveSnapshot() calls store.addSnapshot(...) before it touches this.snapDialog() —
      // that viewChild is unresolved without a real component render, so the dialog.close()
      // call throws here; see the note on saveAsset's equivalent test above.
      const asset = makeAsset({ id: 'a42' });
      page.snapAsset.set(asset);
      page.snapValue.set(99.999);
      page.snapDate.set('2026-07-23');

      expect(() => page.saveSnapshot()).toThrow();

      expect(store.addSnapshot).toHaveBeenCalledWith('a42', { date: '2026-07-23', value: 100 });
    });
  });

  describe('latestValue', () => {
    it('returns 0 for an asset with no snapshots', () => {
      expect(page.latestValue(makeAsset({ snapshots: [] }))).toBe(0);
    });

    it('returns the latest snapshot value', () => {
      const asset = makeAsset({ snapshots: [snap('2026-01-01', 100), snap('2026-06-01', 200)] });
      expect(page.latestValue(asset)).toBe(200);
    });
  });

  describe('assetReturn', () => {
    it('delegates to returnPct using the current from/to range', () => {
      const asset = makeAsset({ snapshots: [snap('2026-01-01', 100), snap('2026-06-01', 150)] });
      page.from.set('2026-01-01');
      page.to.set('2026-12-31');

      expect(page.assetReturn(asset)).toBe(50);
    });

    it('returns null when fewer than 2 snapshots fall in range', () => {
      const asset = makeAsset({ snapshots: [snap('2026-01-01', 100)] });
      page.from.set('2026-01-01');
      page.to.set('2026-12-31');

      expect(page.assetReturn(asset)).toBeNull();
    });
  });

  describe('isStale', () => {
    // isoToDate() always parses to local midnight, so pin "now" to midnight too —
    // otherwise a same-day boundary comparison picks up a spurious time-of-day offset.
    it('is false when the asset has no snapshots at all', () => {
      expect(page.isStale(makeAsset({ snapshots: [] }))).toBe(false);
    });

    it('is false for a snapshot from today', () => {
      vi.setSystemTime(new Date('2026-07-23T00:00:00'));
      const asset = makeAsset({ snapshots: [snap('2026-07-23', 100)] });

      expect(page.isStale(asset)).toBe(false);
    });

    it('is false when the latest snapshot is exactly one month before now (boundary, not before)', () => {
      vi.setSystemTime(new Date('2026-07-23T00:00:00'));
      const asset = makeAsset({ snapshots: [snap('2026-06-23', 100)] });

      expect(page.isStale(asset)).toBe(false);
    });

    it('is false when the latest snapshot is just under one month before now', () => {
      vi.setSystemTime(new Date('2026-07-23T00:00:00'));
      const asset = makeAsset({ snapshots: [snap('2026-06-24', 100)] });

      expect(page.isStale(asset)).toBe(false);
    });

    it('is true when the latest snapshot is just over one month before now', () => {
      vi.setSystemTime(new Date('2026-07-23T00:00:00'));
      const asset = makeAsset({ snapshots: [snap('2026-06-22', 100)] });

      expect(page.isStale(asset)).toBe(true);
    });
  });

  describe('categoryLabel', () => {
    it('looks up the Italian label from ASSET_CATEGORY_LABEL', () => {
      expect(page.categoryLabel('conto-corrente')).toBe('Conto corrente');
      expect(page.categoryLabel('azioni-etf')).toBe('Azioni / ETF');
      expect(page.categoryLabel('crypto')).toBe('Crypto');
    });
  });

  describe('onAssetCategory', () => {
    it('ignores non-string values', () => {
      page.onAssetCategory(42);
      expect(page.assetCategory()).toBe('conto-corrente');
    });

    it('ignores null', () => {
      page.onAssetCategory(null);
      expect(page.assetCategory()).toBe('conto-corrente');
    });

    it('ignores an empty string', () => {
      page.onAssetCategory('');
      expect(page.assetCategory()).toBe('conto-corrente');
    });

    it('sets assetCategory on a valid string value', () => {
      page.onAssetCategory('crypto');
      expect(page.assetCategory()).toBe('crypto');
    });
  });

  describe('onFromChange', () => {
    it('ignores null', () => {
      const before = page.from();
      page.onFromChange(null);
      expect(page.from()).toBe(before);
    });

    it('sets from as an ISO string on a valid Date', () => {
      page.onFromChange(new Date('2026-02-15T00:00:00'));
      expect(page.from()).toBe('2026-02-15');
    });
  });

  describe('onToChange', () => {
    it('ignores null', () => {
      const before = page.to();
      page.onToChange(null);
      expect(page.to()).toBe(before);
    });

    it('sets to as an ISO string on a valid Date', () => {
      page.onToChange(new Date('2026-03-10T00:00:00'));
      expect(page.to()).toBe('2026-03-10');
    });
  });

  describe('onAssetDateChange', () => {
    it('ignores null', () => {
      const before = page.assetDate();
      page.onAssetDateChange(null);
      expect(page.assetDate()).toBe(before);
    });

    it('sets assetDate as an ISO string on a valid Date', () => {
      page.onAssetDateChange(new Date('2026-04-05T00:00:00'));
      expect(page.assetDate()).toBe('2026-04-05');
    });
  });

  describe('onSnapDateChange', () => {
    it('ignores null', () => {
      const before = page.snapDate();
      page.onSnapDateChange(null);
      expect(page.snapDate()).toBe(before);
    });

    it('sets snapDate as an ISO string on a valid Date', () => {
      page.onSnapDateChange(new Date('2026-05-20T00:00:00'));
      expect(page.snapDate()).toBe('2026-05-20');
    });
  });

  describe('confirmDeleteAsset', () => {
    it('is a no-op when there is no pending deletingAsset', () => {
      page.deletingAsset.set(null);

      page.confirmDeleteAsset();

      expect(store.remove).not.toHaveBeenCalled();
    });

    it('calls store.remove with the deleting asset id and clears deletingAsset on valid input', () => {
      // confirmDeleteAsset() calls store.remove(...) and clears deletingAsset before it
      // touches this.deleteAssetDialog() — that viewChild is unresolved without a real
      // component render, so the dialog.close() call throws here. Per house style, the
      // dialog's own open/close behavior is @spartan-ng/helm's responsibility, not this
      // app's, so we assert the real outcome (remove called, state cleared) and let the
      // expected throw happen rather than rendering the full template (which would need
      // provideEchartsCore, only available at the root app.config).
      const asset = makeAsset({ id: 'a1' });
      page.deletingAsset.set(asset);

      expect(() => page.confirmDeleteAsset()).toThrow();

      expect(store.remove).toHaveBeenCalledWith('a1');
      expect(page.deletingAsset()).toBeNull();
    });
  });
});
