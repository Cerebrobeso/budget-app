import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { Asset, AssetSnapshot, uid } from './models';
import { BUDGET_REPOSITORY } from './repository';
import { reportWriteFailure } from './write-failure';

export function latest(asset: Asset): AssetSnapshot | undefined {
  return asset.snapshots.at(-1);
}

/** Rendimento % tra il primo e l'ultimo snapshot compresi nel range. */
export function returnPct(snaps: AssetSnapshot[], fromIso: string, toIso: string): number | null {
  const inRange = snaps.filter((s) => s.date >= fromIso && s.date <= toIso);
  if (inRange.length < 2) return null;
  const first = inRange[0].value;
  const last = inRange[inRange.length - 1].value;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}

@Injectable({ providedIn: 'root' })
export class PortfolioStore {
  private readonly repo = inject(BUDGET_REPOSITORY);
  private readonly auth = inject(AuthService);
  readonly assets = signal<Asset[]>([]);
  readonly ready = signal(false);

  readonly active = computed(() => this.assets().filter((a) => !a.archived));

  readonly totalValue = computed(() =>
    this.active().reduce((sum, a) => sum + (latest(a)?.value ?? 0), 0),
  );

  constructor() {
    effect(() => {
      const ready = this.auth.ready();
      const user = this.auth.user();
      if (!ready) return;
      void this.reload(user);
    });
  }

  private async reload(user: User | null): Promise<void> {
    this.ready.set(false);
    if (!user) {
      this.assets.set([]);
      this.ready.set(true);
      return;
    }
    const stored = await this.repo.loadAssets();
    this.assets.set(stored ?? []);
    this.ready.set(true);
  }

  add(asset: Omit<Asset, 'id'>): void {
    const newAsset: Asset = { ...asset, id: uid() };
    this.assets.update((list) => [...list, newAsset]);
    this.repo.addAsset(newAsset).catch((err) =>
      reportWriteFailure(err, () => this.assets.update((list) => list.filter((a) => a.id !== newAsset.id))),
    );
  }

  rename(id: string, name: string): void {
    const current = this.assets().find((a) => a.id === id);
    this.assets.update((list) => list.map((a) => (a.id === id ? { ...a, name } : a)));
    this.repo.updateAsset(id, { name }).catch((err) =>
      reportWriteFailure(err, () => {
        if (current) this.assets.update((list) => list.map((a) => (a.id === id ? current : a)));
      }),
    );
  }

  setArchived(id: string, archived: boolean): void {
    const current = this.assets().find((a) => a.id === id);
    this.assets.update((list) => list.map((a) => (a.id === id ? { ...a, archived } : a)));
    this.repo.updateAsset(id, { archived }).catch((err) =>
      reportWriteFailure(err, () => {
        if (current) this.assets.update((list) => list.map((a) => (a.id === id ? current : a)));
      }),
    );
  }

  remove(id: string): void {
    const removed = this.assets().find((a) => a.id === id);
    this.assets.update((list) => list.filter((a) => a.id !== id));
    this.repo.removeAsset(id).catch((err) =>
      reportWriteFailure(err, () => {
        if (removed) this.assets.update((list) => [...list, removed]);
      }),
    );
  }

  /** Aggiunge o sostituisce lo snapshot alla data indicata. */
  addSnapshot(assetId: string, snap: AssetSnapshot): void {
    const current = this.assets().find((a) => a.id === assetId);
    let newSnapshots: AssetSnapshot[] = [];
    this.assets.update((list) =>
      list.map((a) => {
        if (a.id !== assetId) return a;
        const others = a.snapshots.filter((s) => s.date !== snap.date);
        newSnapshots = [...others, snap].sort((x, y) => x.date.localeCompare(y.date));
        return { ...a, snapshots: newSnapshots };
      }),
    );
    this.repo.updateAsset(assetId, { snapshots: newSnapshots }).catch((err) =>
      reportWriteFailure(err, () => {
        if (current) this.assets.update((list) => list.map((a) => (a.id === assetId ? current : a)));
      }),
    );
  }

  removeSnapshot(assetId: string, date: string): void {
    const current = this.assets().find((a) => a.id === assetId);
    let newSnapshots: AssetSnapshot[] = [];
    this.assets.update((list) =>
      list.map((a) => {
        if (a.id !== assetId) return a;
        newSnapshots = a.snapshots.filter((s) => s.date !== date);
        return { ...a, snapshots: newSnapshots };
      }),
    );
    this.repo.updateAsset(assetId, { snapshots: newSnapshots }).catch((err) =>
      reportWriteFailure(err, () => {
        if (current) this.assets.update((list) => list.map((a) => (a.id === assetId ? current : a)));
      }),
    );
  }

  /** Serie storica del patrimonio totale: per ogni data nota, somma degli ultimi valori disponibili. */
  readonly totalSeries = computed<AssetSnapshot[]>(() => {
    const assets = this.active();
    const dates = [...new Set(assets.flatMap((a) => a.snapshots.map((s) => s.date)))].sort();
    return dates.map((date) => ({
      date,
      value: assets.reduce((sum, a) => {
        const last = [...a.snapshots].filter((s) => s.date <= date).at(-1);
        return sum + (last?.value ?? 0);
      }, 0),
    }));
  });
}
