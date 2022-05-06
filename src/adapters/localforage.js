// @flow
import type { IStorage } from '../interfaces/storage';
import type { IConfig } from '../interfaces/config';
import type { ITask } from '../interfaces/task';
import * as localforage from "localforage";

/* global localStorage */

export default class LocalForageAdapter implements IStorage {
  config: IConfig;

  prefix: string;

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
    const result: any = await localforage.getItem(this.storageName(name));
    return result || [];
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
    return await localforage.setItem(this.storageName(key), value);
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
    const ask = this.storageName(key);
    const keys = await localforage.keys();
    let result = false;
    
    keys.forEach(function(key) {
      if (ask === key) {
        result = true;
      }
    });

    return result;
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
    const hasKey = await this.has(key);
    let result = false;
    if (hasKey) {
      await localforage.removeItem(this.storageName(key))
        .then(function() {
        result = true;
      });
    }

    return result; 
  }

  /**
   * Compose collection name by suffix
   *
   * @param  {String} suffix
   * @return {String}
   *
   * @api public
   */
  storageName(suffix: string): string {
    return suffix.startsWith(this.getPrefix()) ? suffix : `${this.getPrefix()}_${suffix}`;
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
}
