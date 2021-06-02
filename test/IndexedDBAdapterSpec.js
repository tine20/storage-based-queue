import IndexedDBAdapter from '../src/adapters/indexeddb';
import Config from '../src/config';

describe('IndexedDBAdapter tests', () => {
  // const getKey = suffix => `${config.get('prefix')}_${suffix}`;
  const config = new Config();
  const storageAdapter = new IndexedDBAdapter(config);

  beforeAll(() => {
    return new Promise((resolve, reject) => {
      const dbName = `sbq-${storageAdapter.getPrefix()}`;
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = (e) => {
        resolve(e.target.result);
      };
      req.onerror = (e) => {
        reject(e.target.error);
      };
    });
  });

  it('it should be set an item, -> set()', async () => {
    const result = await storageAdapter.set('test-1', ['hello', 'world']);
    expect(result).toEqual(['hello', 'world']);
  });

  it('it should be get an item from storage, -> get()', async () => {
    await storageAdapter.set('test-2', ['hello', 'world']);
    expect(await storageAdapter.get('test-2')).toEqual(['hello', 'world']);
  });

  it('it should be check item key, -> has()', async () => {
    expect(await storageAdapter.has('test-3')).toBeFalsy();
    await storageAdapter.set('test-3', ['hello', 'world']);
    expect(await storageAdapter.has('test-3')).toBeTruthy();
  });

  it('should be remove an item from storage, -> clear()', async () => {
    await storageAdapter.set('test-4', ['hello', 'world']);
    expect(await storageAdapter.has('test-4')).toBeTruthy();
    expect(await storageAdapter.clear('test-4')).toBeTruthy();
    expect(await storageAdapter.has('test-4')).toBeFalsy();
    expect(await storageAdapter.clear('test-5xxx')).toBeFalsy();
  });
});
