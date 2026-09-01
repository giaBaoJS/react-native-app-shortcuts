import AppShortcuts, {
  clearShortcuts,
  getInitialShortcut,
  getShortcuts,
  setShortcuts,
  shortcutKey,
  type ShortcutItem,
} from '../index';
import * as namedExports from '../index';
import NativeAppShortcuts from '../NativeAppShortcuts';

jest.mock('../NativeAppShortcuts', () => ({
  __esModule: true,
  default: {
    setShortcuts: jest.fn(() => Promise.resolve()),
    clearShortcuts: jest.fn(() => Promise.resolve()),
    getShortcuts: jest.fn(() => Promise.resolve([])),
    getInitialShortcut: jest.fn(() => Promise.resolve(null)),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

const mockedNative = jest.mocked(NativeAppShortcuts);

const validItem: ShortcutItem = {
  id: 'search',
  title: 'Search',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('setShortcuts validation', () => {
  it('rejects duplicate ids without calling the native module', async () => {
    await expect(
      setShortcuts([validItem, { id: 'search', title: 'Another' }])
    ).rejects.toThrow('Duplicate shortcut id "search"');
    expect(mockedNative.setShortcuts).not.toHaveBeenCalled();
  });

  it('rejects an empty id', async () => {
    await expect(setShortcuts([{ id: '', title: 'Search' }])).rejects.toThrow(
      'must have a non-empty string "id"'
    );
    expect(mockedNative.setShortcuts).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only id', async () => {
    await expect(
      setShortcuts([{ id: '   ', title: 'Search' }])
    ).rejects.toThrow('must have a non-empty string "id"');
  });

  it('rejects an empty title', async () => {
    await expect(setShortcuts([{ id: 'search', title: '' }])).rejects.toThrow(
      'must have a non-empty string "title"'
    );
    expect(mockedNative.setShortcuts).not.toHaveBeenCalled();
  });

  it('rejects non-string data values', async () => {
    await expect(
      setShortcuts([
        {
          id: 'search',
          title: 'Search',
          data: { count: 3 } as unknown as { [key: string]: string },
        },
      ])
    ).rejects.toThrow('must be a string');
  });

  it('rejects a non-array argument', async () => {
    await expect(
      setShortcuts(validItem as unknown as ShortcutItem[])
    ).rejects.toThrow('expects an array');
  });

  it('passes normalized items to the native module', async () => {
    await setShortcuts([
      {
        id: 'compose',
        title: 'New Message',
        subtitle: 'Start a conversation',
        iconName: 'square.and.pencil',
        data: { screen: 'compose' },
      },
      validItem,
    ]);
    expect(mockedNative.setShortcuts).toHaveBeenCalledTimes(1);
    expect(mockedNative.setShortcuts).toHaveBeenCalledWith([
      {
        id: 'compose',
        title: 'New Message',
        subtitle: 'Start a conversation',
        iconName: 'square.and.pencil',
        data: { screen: 'compose' },
      },
      { id: 'search', title: 'Search' },
    ]);
  });

  it('allows an empty array to clear all shortcuts', async () => {
    await expect(setShortcuts([])).resolves.toBeUndefined();
    expect(mockedNative.setShortcuts).toHaveBeenCalledWith([]);
  });
});

describe('clearShortcuts / getShortcuts', () => {
  it('forwards clearShortcuts to the native module', async () => {
    await clearShortcuts();
    expect(mockedNative.clearShortcuts).toHaveBeenCalledTimes(1);
  });

  it('returns the native list of shortcuts', async () => {
    mockedNative.getShortcuts.mockResolvedValueOnce([validItem]);
    await expect(getShortcuts()).resolves.toEqual([validItem]);
  });
});

describe('getInitialShortcut', () => {
  it('resolves null when the app was not launched from a shortcut', async () => {
    await expect(getInitialShortcut()).resolves.toBeNull();
  });

  it('resolves the shortcut that cold-started the app', async () => {
    const item: ShortcutItem = {
      id: 'favorites',
      title: 'Favorites',
      data: { screen: 'favorites' },
    };
    mockedNative.getInitialShortcut.mockResolvedValueOnce(item);
    await expect(getInitialShortcut()).resolves.toEqual(item);
  });
});

describe('shortcutKey', () => {
  it('is stable regardless of data key order', () => {
    expect(shortcutKey({ id: 'a', title: 'A', data: { x: '1', y: '2' } })).toBe(
      shortcutKey({ id: 'a', title: 'A', data: { y: '2', x: '1' } })
    );
  });

  it('differs when the payload differs', () => {
    expect(shortcutKey({ id: 'a', title: 'A', data: { x: '1' } })).not.toBe(
      shortcutKey({ id: 'a', title: 'A', data: { x: '2' } })
    );
  });

  it('differs for different ids', () => {
    expect(shortcutKey({ id: 'a', title: 'T' })).not.toBe(
      shortcutKey({ id: 'b', title: 'T' })
    );
  });

  // The key is public API and ends up in logs, Map keys and React keys, so a
  // stray control character in the separator is a defect callers cannot see.
  it('contains no control characters', () => {
    const key = shortcutKey({ id: 'a', title: 'T', data: { x: '1' } });

    expect([...key].filter((char) => char.charCodeAt(0) < 0x20)).toEqual([]);
    expect(key).toBe('a {"x":"1"}');
  });
});

describe('default export', () => {
  // The README promises every function is reachable both ways, so this is
  // derived from the module rather than a hand-kept list that can drift.
  it('carries every function the module exports by name', () => {
    const functionExports = Object.entries(namedExports)
      .filter(
        ([name, value]) => name !== 'default' && typeof value === 'function'
      )
      .map(([name]) => name);

    expect(functionExports).toContain('shortcutKey');
    expect(Object.keys(AppShortcuts).sort()).toEqual(functionExports.sort());
  });
});
