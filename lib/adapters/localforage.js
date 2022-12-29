import _JSON$stringify from '@babel/runtime-corejs3/core-js/json/stringify';
import _Object$defineProperty from '@babel/runtime-corejs3/core-js/object/define-property';
import * as localforage from "localforage";

function _defineProperty(obj, key, value) {
  if (key in obj) {
    _Object$defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    obj[key] = value;
  }
  return obj;
}

/* global localforage */

export default class LocalForageAdapter {
  constructor(config) {
    _defineProperty(this, 'config', void 0);
    _defineProperty(this, 'prefix', void 0);
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
  async get(name) {
    const result = await localforage.getItem(this.storageName(name));
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
  async set(key, value) {
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
  async has(key) {
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
  async clear(key) {
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
  storageName(suffix) {
    return suffix.startsWith(this.getPrefix())
      ? suffix
      : `${this.getPrefix()}_${suffix}`;
  }

  /**
   * Get prefix of channel collection
   *
   * @return {String}
   *
   * @api public
   */
  getPrefix() {
    return this.config.get('prefix');
  }
}
