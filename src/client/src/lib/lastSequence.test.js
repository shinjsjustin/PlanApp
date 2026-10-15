import { readLastSequence, writeLastSequence } from './lastSequence';

beforeEach(() => localStorage.clear());
afterEach(() => jest.restoreAllMocks());

it('round-trips a number under the project key', () => {
  writeLastSequence(7, 42);
  expect(localStorage.getItem('planapp:lastSequence:7')).toBe('42');
  expect(readLastSequence(7)).toBe(42);
  expect(readLastSequence(8)).toBeNull();
});

it('returns null for garbage', () => {
  localStorage.setItem('planapp:lastSequence:7', 'abc');
  expect(readLastSequence(7)).toBeNull();
});

it('never throws when storage throws', () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
  expect(readLastSequence(7)).toBeNull();
  expect(() => writeLastSequence(7, 1)).not.toThrow();
});
