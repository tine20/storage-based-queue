import LocalForageAdapter from '../src/adapters/localforage';
import Config from '../src/config';
import localforage from "localforage";

describe('LocalForageAdapter tests', () => {
  const getKey = suffix => `${config.get('prefix')}_${suffix}`;
  const config = new Config();
  const storageAdapter = new LocalForageAdapter(config);

  afterAll(() => {
    storageAdapter.store = {};
  });

  it('it should be set an item, -> set()', async () => {
    const data = ['hello', 'world'];
    const result = await storageAdapter.set('hello', data);
    expect(result).toEqual(data);
  });

  it('it should be get an item from storage, -> get()', async () => {
    await storageAdapter.set('test-1', ['test-1', 'value']);
    expect(await storageAdapter.get('test-1')).toEqual(['test-1', 'value']);
  });

  it('it should be check item key, -> has()', async () => {
    expect(await storageAdapter.has('test-2')).toBeFalsy();
    await storageAdapter.set('test-2', ['hello', 'world']);
    expect(await storageAdapter.has('test-2')).toBeTruthy();
  });

  it('should be remove an item from storage, -> clear()', async () => {
    await storageAdapter.set('test-3', ['hello', 'world']);
    expect(await storageAdapter.has('test-3')).toBeTruthy();
    expect(await storageAdapter.clear('test-3')).toBeTruthy();
    expect(await storageAdapter.has('test-3')).toBeFalsy();
    expect(await storageAdapter.clear('test-4xxx')).toBeFalsy();
  });
});
