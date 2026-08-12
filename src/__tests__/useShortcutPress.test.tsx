import { DeviceEventEmitter } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  SHORTCUT_PRESSED_EVENT,
  addShortcutListener,
  useShortcutPress,
  type ShortcutItem,
} from '../index';
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

const itemA: ShortcutItem = {
  id: 'compose',
  title: 'New Message',
  data: { screen: 'compose' },
};

const itemB: ShortcutItem = {
  id: 'search',
  title: 'Search',
};

function Harness({ onPress }: { onPress: (item: ShortcutItem) => void }) {
  useShortcutPress(onPress);
  return null;
}

async function renderHarness(
  onPress: (item: ShortcutItem) => void
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<Harness onPress={onPress} />);
  });
  return renderer!;
}

async function emitPress(item: ShortcutItem): Promise<void> {
  await act(async () => {
    DeviceEventEmitter.emit(SHORTCUT_PRESSED_EVENT, item);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedNative.getInitialShortcut.mockResolvedValue(null);
});

describe('addShortcutListener', () => {
  it('delivers press events and can be removed', async () => {
    const callback = jest.fn();
    const subscription = addShortcutListener(callback);

    await emitPress(itemA);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(itemA);

    subscription.remove();
    await emitPress(itemA);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('useShortcutPress', () => {
  it('fires for a warm press when there is no initial shortcut', async () => {
    const callback = jest.fn();
    const renderer = await renderHarness(callback);

    await emitPress(itemA);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(itemA);
    renderer.unmount();
  });

  it('fires for the shortcut that cold-started the app', async () => {
    mockedNative.getInitialShortcut.mockResolvedValue(itemA);
    const callback = jest.fn();
    const renderer = await renderHarness(callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(itemA);
    renderer.unmount();
  });

  it('dedupes a flushed duplicate of the cold-start shortcut', async () => {
    mockedNative.getInitialShortcut.mockResolvedValue(itemA);
    const callback = jest.fn();
    const renderer = await renderHarness(callback);

    // The native side may replay the launch press once listeners attach.
    await emitPress(itemA);
    expect(callback).toHaveBeenCalledTimes(1);

    // A real, later press of the same shortcut still fires.
    await emitPress(itemA);
    expect(callback).toHaveBeenCalledTimes(2);
    renderer.unmount();
  });

  it('only dedupes events matching the initial shortcut id and data', async () => {
    mockedNative.getInitialShortcut.mockResolvedValue(itemA);
    const callback = jest.fn();
    const renderer = await renderHarness(callback);

    await emitPress(itemB);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, itemA);
    expect(callback).toHaveBeenNthCalledWith(2, itemB);
    renderer.unmount();
  });

  it('does not dedupe a matching press outside the dedup window', async () => {
    const start = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(start);
    mockedNative.getInitialShortcut.mockResolvedValue(itemA);
    const callback = jest.fn();
    const renderer = await renderHarness(callback);

    nowSpy.mockReturnValue(start + 60_000);
    await emitPress(itemA);

    expect(callback).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
    renderer.unmount();
  });

  it('stops firing after unmount', async () => {
    const callback = jest.fn();
    const renderer = await renderHarness(callback);

    await act(async () => {
      renderer.unmount();
    });
    await emitPress(itemA);

    expect(callback).not.toHaveBeenCalled();
  });

  it('still subscribes to presses when getInitialShortcut rejects', async () => {
    mockedNative.getInitialShortcut.mockRejectedValue(new Error('boom'));
    const callback = jest.fn();
    const renderer = await renderHarness(callback);

    await emitPress(itemA);

    expect(callback).toHaveBeenCalledTimes(1);
    renderer.unmount();
  });
});
