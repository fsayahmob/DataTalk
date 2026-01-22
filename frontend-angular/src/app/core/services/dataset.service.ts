import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StorageService } from './storage.service';

/**
 * Dataset - Structure d'un dataset
 */
export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  status: 'empty' | 'syncing' | 'ready' | 'error';
  isActive: boolean;
  rowCount: number;
  tableCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'active_dataset_id';

/**
 * DatasetService - Gestion du dataset actif
 *
 * Source de vérité pour le dataset sélectionné.
 * Utilisé par:
 * - DatasetInterceptor pour ajouter dataset_id aux requêtes
 * - Composants pour afficher/changer le dataset actif
 */
@Injectable({
  providedIn: 'root',
})
export class DatasetService {
  private readonly storage = inject(StorageService);
  private readonly activeDataset$ = new BehaviorSubject<Dataset | null>(null);
  private readonly datasets$ = new BehaviorSubject<Dataset[]>([]);
  private readonly loading$ = new BehaviorSubject<boolean>(false);

  // ═══════════════════════════════════════════════════════════
  // GETTERS OBSERVABLES (pour les composants)
  // ═══════════════════════════════════════════════════════════

  /**
   * Observable du dataset actif
   */
  getActiveDataset$(): Observable<Dataset | null> {
    return this.activeDataset$.asObservable();
  }

  /**
   * Observable de la liste des datasets
   */
  getDatasets$(): Observable<Dataset[]> {
    return this.datasets$.asObservable();
  }

  /**
   * Observable de l'état de chargement
   */
  getLoading$(): Observable<boolean> {
    return this.loading$.asObservable();
  }

  // ═══════════════════════════════════════════════════════════
  // GETTERS SYNCHRONES (pour les interceptors)
  // ═══════════════════════════════════════════════════════════

  /**
   * Getter synchrone du dataset actif (pour les interceptors)
   */
  getActiveDataset(): Dataset | null {
    return this.activeDataset$.getValue();
  }

  /**
   * Getter synchrone de l'ID du dataset actif
   */
  getActiveDatasetId(): string | null {
    const dataset = this.activeDataset$.getValue();
    return dataset?.id ?? null;
  }

  // ═══════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════

  /**
   * Définit le dataset actif
   */
  setActiveDataset(dataset: Dataset): void {
    this.activeDataset$.next(dataset);
    this.storage.set(STORAGE_KEY, dataset.id);
  }

  /**
   * Met à jour la liste des datasets
   * Restaure le dataset actif depuis le storage si disponible
   */
  setDatasets(datasets: Dataset[]): void {
    this.datasets$.next(datasets);

    // Restaurer le dataset actif depuis le storage
    const activeId = this.storage.get(STORAGE_KEY);
    if (activeId !== null) {
      const active = datasets.find((d) => d.id === activeId);
      if (active) {
        this.activeDataset$.next(active);
        return;
      }
    }

    // Si pas de dataset actif en storage, prendre le premier actif ou le premier
    const firstActive = datasets.find((d) => d.isActive);
    if (firstActive) {
      this.setActiveDataset(firstActive);
    } else if (datasets.length > 0) {
      this.setActiveDataset(datasets[0]);
    }
  }

  /**
   * Efface le dataset actif
   */
  clearActiveDataset(): void {
    this.activeDataset$.next(null);
    this.storage.remove(STORAGE_KEY);
  }

  /**
   * Définit l'état de chargement
   */
  setLoading(loading: boolean): void {
    this.loading$.next(loading);
  }

  /**
   * Met à jour un dataset dans la liste
   */
  updateDataset(updatedDataset: Dataset): void {
    const datasets = this.datasets$.getValue();
    const index = datasets.findIndex((d) => d.id === updatedDataset.id);

    if (index !== -1) {
      const newDatasets = [...datasets];
      newDatasets[index] = updatedDataset;
      this.datasets$.next(newDatasets);

      // Met à jour aussi le dataset actif si c'est le même
      const active = this.activeDataset$.getValue();
      if (active?.id === updatedDataset.id) {
        this.activeDataset$.next(updatedDataset);
      }
    }
  }

  /**
   * Supprime un dataset de la liste
   */
  removeDataset(datasetId: string): void {
    const datasets = this.datasets$.getValue();
    const newDatasets = datasets.filter((d) => d.id !== datasetId);
    this.datasets$.next(newDatasets);

    // Si c'était le dataset actif, le clearer
    const active = this.activeDataset$.getValue();
    if (active?.id === datasetId) {
      this.clearActiveDataset();
    }
  }
}
