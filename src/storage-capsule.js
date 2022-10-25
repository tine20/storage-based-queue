/* @flow */
import groupBy from 'group-by';
import type { IConfig } from './interfaces/config';
import type { IStorage } from './interfaces/storage';
import type { ITask } from './interfaces/task';
import { LocalStorageAdapter, InMemoryAdapter, LocalForageAdapter } from './adapters';
import { excludeSpecificTasks, lifo, fifo } from './utils';

/* eslint no-console: ["error", { allow: ["warn", "error"] }] */
/* eslint no-underscore-dangle: [2, { "allow": ["_id"] }] */
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generateId"] }] */

export default class StorageCapsule {
  config: IConfig;

  storage: IStorage;

  storageChannel: string;

  storageJobFifo: any[];

  constructor(config: IConfig, storage: IStorage) {
    this.config = config;
    this.storage = this.initialize(storage);
    this.storageJobFifo = [];
  }

  initialize(Storage: any): IStorage {
    /* eslint no-else-return: off */
    if (typeof Storage === 'object') {
      return Storage;
    } else if (typeof Storage === 'function') {
      return new Storage(this.config);
    } else if (this.config.get('storage') === 'localstorage') {
      return new LocalStorageAdapter(this.config);
    } else if (this.config.get('storage') === 'localforage') {
      return new LocalForageAdapter(this.config);
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
  storageQueue(): IStorage<any[]> {
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

    if (resolve) {
      resolve({
        async get(key: string) { return wrap('get'); },
        async set(key: string, value: any[]) {return wrap('set', arguments); },
        async has(key: string) {return wrap('has', arguments); },
        async clear() { return wrap('clear'); },
      });
    }

    const wrap = async (fn, args) => {
      try {
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
  }

  /**
   * Select a channel by channel name
   *
   * @param  {String} name
   * @return {StorageCapsule}
   *
   * @api public
   */
  channel(name: string): StorageCapsule {
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
  async fetch(): Promise<any[]> {
    const all = (await this.all()).filter(excludeSpecificTasks);
    const tasks = groupBy(all, 'priority');
    return Object.keys(tasks)
      .map((key) => parseInt(key, 10))
      .sort((a, b) => b - a)
      .reduce(this.reduceTasks(tasks), []);
  }

   /**
   * Save tasks to storage
   *
   * @param  {ITask} task
   * @return {String|Boolean}
   *
   * @api public
   */
  async save(newTasks) {
    if (!Array.isArray(newTasks)) {
      newTasks = [newTasks];
    }
    let result = true;
    _.each(newTasks, (task) => {
      if (typeof task !== 'object') {
        result = false;
      }
    });
    
    if (!result) {
      return false;
    }
    
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
    _.each(newTasks, (task) => {
      const newTask = this.prepareTask(task);
      // add task to storage
      tasks.push(newTask);
    })

    // save tasks
    await this.storage.set(this.storageChannel, tasks);

    return newTasks.map(function(task){ return task._id; });
  }

  /**
   * Update channel store.
   *
   * @return {string}
   *   The value. This annotation can be used for type hinting purposes.
   */
  async update(id: string, update: { [property: string]: any }): Promise<boolean> {
    return await this.storageQueue().then(async (storage) => {
      const data: any[] = await this.all();
      const index: number = data.findIndex((t) => t._id === id);

      // if index not found, return false
      if (index < 0) return false;
  
      // merge existing object with given update object
      data[index] = { ...data[index], ...update };

      await storage.set(this.storageChannel, data);

      return true;
      
    });
  }

  /**
   * Update channel store with batch tasks.
   *
   * @return {string}
   *   The value. This annotation can be used for type hinting purposes.
   */
  async updateBatch(tasks) {
    const result = await this.storageQueue().then(async (storage) => {
      const data = await this.all();
      _.each(tasks, (task) =>{
        const index = data.findIndex((t) => t._id === task._id);
        // if index not found, return false
        if (index > -1) {
          // merge existing object with given update object
          data[index] = { ...data[index], ...task };
        }
      })

      await storage.set(this.storageChannel, data);
      return true;
    });
    
    return result;
  }

  /**
   * Remove task from storage
   *
   * @param  {String} id
   * @return {string}
   *
   * @api public
   */
  async delete(id: string): Promise<boolean> {
    return await this.storageQueue().then(async (storage) => {
      const data: any[] = await this.all();
      const index: number = data.findIndex((d) => d._id === id);

      if (index < 0) return false;

      delete data[index];

      await storage.set(this.storageChannel, data.filter((d) => d));

      return true;
    });
  }

  /**
   * Remove tasks from storage
   *
   * @param  {String} id
   * @return {string}
   *
   * @api public
   */
  async deleteBatch(tasks) {
    const result = await this.storageQueue().then(async (storage) => {
      const data: any[] = await this.all();
      const taskIds = _.map(tasks, '_id');
  
      data = _.filter(data, (task) =>{
        const index = taskIds.findIndex((id) => id === task._id);
        return index === -1;
      })
  
      await storage.set(
          this.storageChannel,
          data
      );
    
    return result;
  }

  /**
   * Get all tasks
   *
   * @return {Any[]}
   *
   * @api public
   */
  async all(): Promise<ITask[]> {
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
  generateId(): string {
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
  prepareTask(task: ITask): ITask {
    /* eslint no-param-reassign: off */
    const newTask: any = {};
    Object.keys(task).forEach((key) => {
      newTask[key] = task[key];
    });
    newTask.createdAt = Date.now();
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
  reduceTasks(tasks: ITask[]): Function {
    const reduceFunc = (result: ITask[], key: any): ITask[] => {
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
  async isExceeded(): Promise<boolean> {
    const limit: number = this.config.get('limit');
    const tasks: ITask[] = (await this.all()).filter(excludeSpecificTasks);
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
  async clear(channel: string): Promise<void> {
    this.storageJobFifo = [];
    await this.storage.clear(channel);
  }
}
