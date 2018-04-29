/* @flow */
import Queue from './queue';
import { excludeSpecificTasks, log, hasMethod, isFunction } from './utils';
import StorageCapsule from './storage-capsule';
import type ITask from '../interfaces/task';
import type IWorker from '../interfaces/worker';

/* eslint no-underscore-dangle: [2, { "allow": ["_id"] }] */
/* eslint no-param-reassign: "error" */
/* eslint use-isnan: "error" */

/**
 * Task priority controller helper
 * Context: Queue
 *
 * @return {ITask}
 * @param {ITask} task
 *
 * @api private
 */
export function checkPriority(task: ITask): ITask {
  task.priority = task.priority || 0;

  if (typeof task.priority !== 'number') task.priority = 0;

  return task;
}

/**
 * Shortens function the db belongsto current channel
 * Context: Queue
 *
 * @return {StorageCapsule}
 *
 * @api private
 */
export function db(): StorageCapsule {
  return (this: any).storage.channel((this: any).currentChannel);
}

/**
 * Get unfreezed tasks by the filter function
 * Context: Queue
 *
 * @return {ITask}
 *
 * @api private
 */
export async function getTasksWithoutFreezed(): Promise<ITask[]> {
  return (await db.call(this).all()).filter(excludeSpecificTasks.bind(['freezed']));
}

/**
 * Log proxy helper
 * Context: Queue
 *
 * @return {void}
 * @param {string} key
 * @param {string} data
 * @param {boolean} cond
 *
 * @api private
 */
export function logProxy(...args: any): void {
  log.call(
    // debug mode status
    (this: any).config.get('debug'),

    // log arguments
    ...args,
  );
}

/**
 * New task save helper
 * Context: Queue
 *
 * @param {ITask} task
 * @return {string|boolean}
 *
 * @api private
 */
export async function saveTask(task: ITask): Promise<string | boolean> {
  const result = await db.call(this).save(checkPriority(task));
  return result;
}

/**
 * Task remove helper
 * Context: Queue
 *
 * @param {string} id
 * @return {boolean}
 *
 * @api private
 */
export async function removeTask(id: string): Promise<boolean> {
  const result = await db.call(this).delete(id);
  return result;
}

/**
 * Events dispatcher helper
 * Context: Queue
 *
 * @param {ITask} task
 * @param {string} type
 * @return {void}
 *
 * @api private
 */
export function dispatchEvents(task: ITask, type: string): boolean | void {
  if (!('tag' in task)) return false;

  const events = [[`${task.tag}:${type}`, 'fired'], [`${task.tag}:*`, 'wildcard-fired']];

  events.forEach((e) => {
    this.event.emit(e[0], task);
    logProxy.call((this: any), `event.${e[1]}`, e[0]);
  });

  return true;
}

/**
 * Queue stopper helper
 * Context: Queue
 *
 * @return {void}
 *
 * @api private
 */
export function stopQueue(): void {
  this.stop();

  clearTimeout(this.currentTimeout);

  logProxy.call(this, 'queue.stopped', 'stop');
}

/**
 * Failed job handler
 * Context: Queue
 *
 * @param {ITask} task
 * @return {ITask} job
 * @return {Function}
 *
 * @api private
 */
export async function failedJobHandler(task: ITask): Promise<Function> {
  return async function childFailedHandler(): Promise<void> {
    removeTask.call(this, task._id);

    this.event.emit('error', task);

    /* istanbul ignore next */
    await this.next();
  };
}

/**
 * Helper of the lock task of the current job
 * Context: Queue
 *
 * @param {ITask} task
 * @return {boolean}
 *
 * @api private
 */
export async function lockTask(task: ITask): Promise<boolean> {
  const result = await db.call(this).update(task._id, { locked: true });
  return result;
}

/**
 * Class event luancher helper
 * Context: Queue
 *
 * @param {string} name
 * @param {IWorker} worker
 * @param {any} args
 * @return {boolean|void}
 *
 * @api private
 */
export function fireJobInlineEvent(name: string, worker: IWorker, args: any): boolean {
  if (hasMethod(worker, name) && isFunction(worker[name])) {
    worker[name].call(worker, args);
    return true;
  }
  return false;
}

/**
 * Process handler of succeeded job
 * Context: Queue
 *
 * @param {ITask} task
 * @return {void}
 *
 * @api private
 */
export function successProcess(task: ITask): void {
  removeTask.call(this, task._id);
}

/**
 * Update task's retry value
 * Context: Queue
 *
 * @param {ITask} task
 * @param {IWorker} worker
 * @return {ITask}
 *
 * @api private
 */
export function updateRetry(task: ITask, worker: IWorker): ITask {
  if (!('retry' in worker)) worker.retry = 1;

  if (!('tried' in task)) {
    task.tried = 0;
    task.retry = worker.retry;
  }

  task.tried += 1;

  if (task.tried >= worker.retry) {
    task.freezed = true;
  }

  return task;
}

/**
 * Process handler of retried job
 * Context: Queue
 *
 * @param {ITask} task
 * @param {IWorker} worker
 * @return {boolean}
 *
 * @api private
 */
export async function retryProcess(task: ITask, worker: IWorker): Promise<boolean> {
  // dispacth custom retry event
  dispatchEvents.call(this, task, 'retry');

  // update retry value
  const updateTask: ITask = updateRetry.call(this, task, worker);

  // delete lock property for next process
  updateTask.locked = false;

  const result = await db.call(this).update(task._id, updateTask);

  return result;
}

/**
 * Succeed job handler
 * Context: Queue
 *
 * @param {ITask} task
 * @param {IWorker} worker
 * @return {Function}
 *
 * @api private
 */
export async function successJobHandler(task: ITask, worker: IWorker): Promise<Function> {
  const self: Queue = this;
  return async function childSuccessJobHandler(result: boolean): Promise<void> {
    // dispatch job process after runs a task but only non error jobs
    if (result) {
      // go ahead to success process
      successProcess.call(self, task);
    } else {
      // go ahead to retry process
      retryProcess.call(self, task, worker);
    }

    // fire job after event
    fireJobInlineEvent.call(self, 'after', worker, task.args);

    // dispacth custom after event
    dispatchEvents.call(self, task, 'after');

    // try next queue job
    await self.next();
  };
}

/**
 * Job handler helper
 * Context: Queue
 *
 * @param {ITask} task
 * @param {IJob} worker
 * @param {IWorker} workerInstance
 * @return {Function}
 *
 * @api private
 */

export /* istanbul ignore next */ function loopHandler(
  task: ITask,
  worker: Function,
  workerInstance: IWorker,
): Function {
  return async function childLoopHandler(): Promise<void> {
    const self: Queue = this;

    // lock the current task for prevent race condition
    await lockTask.call(self, task);

    // fire job before event
    fireJobInlineEvent.call(this, 'before', workerInstance, task.args);

    // dispacth custom before event
    dispatchEvents.call(this, task, 'before');

    const deps = Queue.workerDeps[worker.name];

    // preparing worker dependencies
    const dependencies = Object.values(deps || {});

    // Task runner promise
    workerInstance.handle
      .call(workerInstance, task.args, ...dependencies)
      .then((await successJobHandler.call(self, task, workerInstance)).bind(self))
      .catch((await failedJobHandler.call(self, task)).bind(self));
  };
}

/**
 * Timeout creator helper
 * Context: Queue
 *
 * @return {number}""
 *
 * @api private
 */
export async function createTimeout(): Promise<number> {
  // if running any job, stop it
  // the purpose here is to prevent cocurrent operation in same channel
  clearTimeout(this.currentTimeout);

  // Get next task
  const task: ITask = (await db.call(this).fetch()).shift();

  if (task === undefined) {
    logProxy.call(this, 'queue.empty', this.currentChannel);
    stopQueue.call(this);
    return 1;
  }

  if (!this.container.has(task.handler)) {
    logProxy.call(this, 'queue.not-found', task.handler);
    await (await failedJobHandler.call(this, task)).call(this);
    return 1;
  }

  // Get worker with handler name
  const JobWorker: Function = this.container.get(task.handler);

  // Create a worker instance
  const workerInstance: IWorker = new JobWorker();

  // get always last updated config value
  const timeout: number = workerInstance.timeout || this.config.get('timeout');

  // create a array with handler parameters for shorten line numbers
  const params = [task, JobWorker, workerInstance];

  // Get handler function for handle on completed event
  const handler: Function = (await loopHandler.call(this, ...params)).bind(this);

  // create new timeout for process a job in queue
  // binding loopHandler function to setTimeout
  // then return the timeout instance
  this.currentTimeout = setTimeout(handler, timeout);

  return this.currentTimeout;
}

/**
 * Set the status to false of queue
 * Context: Queue
 *
 * @return {void}
 *
 * @api private
 */
export function statusOff(): void {
  this.running = false;
}

/**
 * Checks whether a task is replicable or not
 * Context: Queue
 *
 * @param {ITask} task
 * @return {boolean}
 *
 * @api private
 */
export async function canMultiple(task: ITask): Promise<boolean> {
  if (typeof task !== 'object' || task.unique !== true) return true;
  return (await this.hasByTag(task.tag)) === false;
}

/**
 * Job handler class register
 * Context: Queue
 *
 * @param {ITask} task
 * @param {IWorker} worker
 * @return {void}
 *
 * @api private
 */
export function registerWorkers(): boolean {
  if (Queue.isRegistered) return false;

  const workers = Queue.queueWorkers || {};

  this.container.merge(workers);

  Queue.isRegistered = true;

  return true;
}
