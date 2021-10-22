import _Object$keys from '@babel/runtime-corejs2/core-js/object/keys';
import _parseInt from '@babel/runtime-corejs2/core-js/parse-int';
import _Date$now from '@babel/runtime-corejs2/core-js/date/now';
import _Object$defineProperty from '@babel/runtime-corejs2/core-js/object/define-property';
import groupBy from 'group-by';
import { LocalStorageAdapter, InMemoryAdapter } from './adapters';
import { excludeSpecificTasks, lifo, fifo } from './utils';

// eslint-disable-next-line no-underscore-dangle
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

/* eslint no-console: ["error", { allow: ["warn", "error"] }] */
/* eslint no-underscore-dangle: [2, { "allow": ["_id"] }] */
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generateId"] }] */

export default class StorageCapsule {
  constructor(config, storage) {
    // eslint-disable-next-line no-void
    _defineProperty(this, 'config', void 0);
    // eslint-disable-next-line no-void
    _defineProperty(this, 'storage', void 0);
    // eslint-disable-next-line no-void
    _defineProperty(this, 'storageChannel', void 0);
    // eslint-disable-next-line no-void
    _defineProperty(this, 'storageJobFifo', void 0);
    this.config = config;
    this.storage = this.initialize(storage);
    this.storageJobFifo = [];
  }

  initialize(Storage) {
    /* eslint no-else-return: off */
    if (typeof Storage === 'object') {
      return Storage;
    } else if (typeof Storage === 'function') {
      return new Storage(this.config);
    } else if (this.config.get('storage') === 'localstorage') {
      return new LocalStorageAdapter(this.config);
    }
    return new InMemoryAdapter(this.config);
  }

  /**
   * make sure storage actions are executed (and finished) in the order they are called
   *
   * @return {any[]}
   *
   * @api public
   */
  storageQueue() {
    return new Promise((resolve) => {
      this.storageJobFifo.push(resolve);

      if (this.storageJobFifo.length === 1) {
        this.nextJob();
      }
    });
  }

  /**
   * execute next job in storage job buffer
   *
   * @return {any[]}
   */
  nextJob() {
    const resolve = this.storageJobFifo[0];

    const wrap = async (fn, args) => {
      // eslint-disable-next-line no-useless-catch
      try {
        // eslint-disable-next-line prefer-spread
        const result = await this.storage[fn].apply(this.storage, args);
        this.storageJobFifo.splice(0, 1);

        if (this.storageJobFifo.length > 0) {
          setTimeout(this.nextJob(), 1);
        }

        return result;
      } catch (error) {
        throw error;
      }
    };

    if (resolve) {
      resolve({
        // eslint-disable-next-line no-unused-vars
        async get(key) { return wrap('get'); },
        // eslint-disable-next-line no-unused-vars,prefer-rest-params
        async set(key, value) { return wrap('set', arguments); },
        // eslint-disable-next-line no-unused-vars,prefer-rest-params
        async has(key) { return wrap('has', arguments); },
        async clear() { return wrap('clear'); },
      });
    }
  }

  /**
   * Select a channel by channel name
   *
   * @param  {String} name
   * @return {StorageCapsule}
   *
   * @api public
   */
  channel(name) {
    this.storageChannel = name;
    return this;
  }

  /**
   * Fetch tasks from storage with ordered
   *
   * @return {any[]}
   *
   * @api public
   */
  async fetch() {
    const all = (await this.all()).filter(excludeSpecificTasks);
    const tasks = groupBy(all, 'priority');
    return _Object$keys(tasks)
      .map((key) => _parseInt(key, 10))
      .sort((a, b) => b - a)
      .reduce(this.reduceTasks(tasks), []);
  }

  /**
   * Save task to storage
   *
   * @param  {ITask} task
   * @return {String|Boolean}
   *
   * @api public
   */
  async save(task) {
    if (typeof task !== 'object') return false;

    // get all tasks current channel's
    const tasks = await this.storage.get(this.storageChannel);

    // Check the channel limit.
    // If limit is exceeded, does not insert new task
    if (await this.isExceeded()) {
      console.warn(
        `Task limit exceeded: The '${
          this.storageChannel
        }' channel limit is ${this.config.get('limit')}`
      );
      return false;
    }

    // prepare all properties before save
    // example: createdAt etc.
    const newTask = this.prepareTask(task);

    // add task to storage
    tasks.push(newTask);

    // save tasks
    await this.storage.set(this.storageChannel, tasks);

    return newTask._id;
  }

  /**
   * Update channel store.
   *
   * @return {string}
   *   The value. This annotation can be used for type hinting purposes.
   */
  async update(id, update) {
    const result = await this.storageQueue().then(async (storage) => {
      const data = await this.all();
      const index = data.findIndex((t) => t._id === id);

      // if index not found, return false
      if (index < 0) return false;

      // merge existing object with given update object
      data[index] = { ...data[index], ...update };
      await storage.set(this.storageChannel, data);

      return true;
    });

    return result;
  }

  /**
   * Remove task from storage
   *
   * @param  {String} id
   * @return {Boolean}
   *
   * @api public
   */
  async delete(id) {
    const data = await this.all();
    const index = data.findIndex((d) => d._id === id);

    if (index < 0) return false;

    delete data[index];

    await this.storage.set(
      this.storageChannel,
      data.filter((d) => d)
    );

    return true;
  }

  /**
   * Get all tasks
   *
   * @return {Any[]}
   *
   * @api public
   */
  async all() {
    const items = await this.storage.get(this.storageChannel);
    return items;
  }

  /**
   * Generate unique id
   *
   * @return {String}
   *
   * @api public
   */
  generateId() {
    return ((1 + Math.random()) * 0x10000).toString(16);
  }

  /**
   * Add some necessary properties
   *
   * @param  {String} id
   * @return {ITask}
   *
   * @api public
   */
  prepareTask(task) {
    /* eslint no-param-reassign: off */
    const newTask = {};
    _Object$keys(task).forEach((key) => {
      newTask[key] = task[key];
    });
    newTask.createdAt = _Date$now();
    newTask._id = this.generateId();
    return newTask;
  }

  /**
   * Add some necessary properties
   *
   * @param  {ITask[]} tasks
   * @return {Function}
   *
   * @api public
   */
  reduceTasks(tasks) {
    const reduceFunc = (result, key) => {
      if (this.config.get('principle') === 'lifo') {
        return result.concat(tasks[key].sort(lifo));
      }
      return result.concat(tasks[key].sort(fifo));
    };

    return reduceFunc.bind(this);
  }

  /**
   * Task limit checker
   *
   * @return {Boolean}
   *
   * @api public
   */
  async isExceeded() {
    const limit = this.config.get('limit');
    const tasks = (await this.all()).filter(excludeSpecificTasks);
    return !(limit === -1 || limit > tasks.length);
  }

  /**
   * Clear tasks with given channel name
   *
   * @param  {String} channel
   * @return {void}
   *
   * @api public
   */
  async clear(channel) {
    await this.storage.clear(channel);
  }
}
