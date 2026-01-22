import { Injectable } from '@angular/core';

/**
 * StorageService - Wrapper pour localStorage
 *
 * Centralise l'accès au localStorage pour:
 * - Uniformiser l'API
 * - Faciliter les tests (mockable)
 * - Gérer les erreurs de parsing JSON
 */
@Injectable({
  providedIn: 'root',
})
export class StorageService {
  /**
   * Récupère une valeur du localStorage
   */
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      console.error(`StorageService: Error reading key "${key}"`);
      return null;
    }
  }

  /**
   * Stocke une valeur dans le localStorage
   */
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      console.error(`StorageService: Error writing key "${key}"`);
    }
  }

  /**
   * Supprime une valeur du localStorage
   */
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      console.error(`StorageService: Error removing key "${key}"`);
    }
  }

  /**
   * Récupère et parse une valeur JSON
   * Usage: const data = storage.getJson('key') as MyType;
   */
  getJson(key: string): unknown {
    const value = this.get(key);
    if (value === null) {
      return null;
    }
    try {
      return JSON.parse(value) as unknown;
    } catch {
      console.error(`StorageService: Error parsing JSON for key "${key}"`);
      return null;
    }
  }

  /**
   * Stocke une valeur en JSON
   */
  setJson(key: string, value: unknown): void {
    try {
      this.set(key, JSON.stringify(value));
    } catch {
      console.error(`StorageService: Error stringifying JSON for key "${key}"`);
    }
  }
}
