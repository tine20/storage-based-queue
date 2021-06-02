import type { IStorage } from '../interfaces/storage';
import type { IConfig } from '../interfaces/config';
import type { ITask } from '../interfaces/task';

/* global IDBDatabase,indexedDB */

export default class IndexedDBAdapter implements IStorage {
  config: IConfig;

  prefix: string;

  db: IDBDatabase;

  constructor(config: IConfig) {
    this.config = config;
    this.prefix = this.config.get('prefix');
  }

  /**
   * Take item from local storage by key
   *
   * @param  {String} key
   * @return {Promise<ITask>} (array)
   *
   * @api public
   */
  async get(name: string): Promise<ITask[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const store = db.transaction(['Tasks'], 'readonly').objectStore('Tasks');

      const req = store.get(name);

      req.onerror = (e) => {
        reject(e.target.error);
      };
      req.onsuccess = () => {
        resolve(req.result.value);
      };
    });
  }

  /**
   * Add item to local storage
   *
   * @param  {String} key
   * @param  {String} value
   * @return {Promise<Any>}
   *
   * @api public
   */
  async set(key: string, value: any[]): Promise<any> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['Tasks'], 'readwrite');
      const store = tx.objectStore('Tasks');

      const req = store.add({ key, value });

      req.onerror = (e) => {
        reject(e.target.error);
      };
      req.onsuccess = () => {
        resolve(value);
      };
    });
  }

  /**
   * Item checker in local storage
   *
   * @param  {String} key
   * @return {Promise<Boolean>}
   *
   * @api public
   */
  async has(key: string): Promise<boolean> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const store = db.transaction(['Tasks'], 'readonly').objectStore('Tasks');

      const req = store.openCursor(key);

      req.onerror = (e) => {
        reject(e.target.error);
      };
      req.onsuccess = (e) => {
        resolve(!!e.target.result);
      };
    });
  }

  /**
   * Remove item
   *
   * @param  {String} key
   * @return {Promise<Any>}
   *
   * @api public
   */
  async clear(key: string): Promise<any> {
    if (!await this.has(key)) {
      return false;
    }

    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('Tasks', 'readwrite');
      const store = tx.objectStore('Tasks');

      const rq = store.delete(key);

      rq.onerror = (e) => {
        reject(e.target.error);
      };
      rq.onsuccess = () => {
        resolve(true);
      };
    });
  }

  /**
   * Get prefix of channel collection
   *
   * @return {String}
   *
   * @api public
   */
  getPrefix(): string {
    return this.config.get('prefix');
  }

  /**
   * get db
   *
   * @returns {Promise<IDBDatabase>}
   */
  getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve(this.db);
      }

      const conn = indexedDB.open(`sbq-${this.getPrefix()}`, 1);
      conn.onupgradeneeded = (e) => {
        const db = e.target.result;
        db.createObjectStore('Tasks', { keyPath: 'key', autoIncrement: false });
      };
      conn.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(e.target.result);
      };
      conn.onerror = (e) => {
        reject(e.target.error);
      };
    });
  }
}
