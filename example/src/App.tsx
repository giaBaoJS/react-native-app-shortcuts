import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  addShortcutListener,
  clearShortcuts,
  getInitialShortcut,
  getShortcuts,
  setShortcuts,
  useShortcutPress,
  type ShortcutItem,
} from '@giabaojs/react-native-app-shortcuts';

const SAMPLE_SHORTCUTS: ShortcutItem[] = [
  {
    id: 'new-message',
    title: 'New Message',
    subtitle: 'Start a conversation',
    iconName: Platform.select({
      ios: 'square.and.pencil',
      android: 'ic_shortcut_compose',
    }),
    data: { screen: 'compose', source: 'shortcut' },
  },
  {
    id: 'search',
    title: 'Search',
    iconName: Platform.select({
      ios: 'magnifyingglass',
      android: 'ic_shortcut_search',
    }),
    data: { screen: 'search' },
  },
  {
    id: 'favorites',
    title: 'Favorites',
    subtitle: 'Your starred items',
    iconName: Platform.select({
      ios: 'star.fill',
      android: 'ic_shortcut_star',
    }),
    data: { screen: 'favorites' },
  },
];

type LogEntry = {
  key: string;
  time: string;
  kind: 'cold' | 'warm' | 'hook' | 'info';
  message: string;
};

let logCounter = 0;

function formatItem(item: ShortcutItem): string {
  const data = item.data ? ` data=${JSON.stringify(item.data)}` : '';
  return `"${item.id}"${data}`;
}

export default function App() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [active, setActive] = useState<string[]>([]);

  const appendLog = useCallback((kind: LogEntry['kind'], message: string) => {
    const entry: LogEntry = {
      key: `log-${logCounter++}`,
      time: new Date().toLocaleTimeString(),
      kind,
      message,
    };
    setLog((previous) => [entry, ...previous].slice(0, 50));
  }, []);

  const refreshActive = useCallback(async () => {
    try {
      const items = await getShortcuts();
      setActive(items.map((item) => item.id));
    } catch (error) {
      setActive([]);
      console.warn(error);
    }
  }, []);

  // Recommended API: fires for both the cold-start shortcut and warm presses,
  // de-duplicated so each press is reported exactly once.
  useShortcutPress(
    useCallback(
      (item: ShortcutItem) => {
        appendLog('hook', `useShortcutPress → ${formatItem(item)}`);
      },
      [appendLog]
    )
  );

  // Shown for illustration: how the two lower-level channels report presses.
  useEffect(() => {
    getInitialShortcut().then((item) => {
      if (item != null) {
        appendLog('cold', `Cold start via ${formatItem(item)}`);
      } else {
        appendLog('info', 'Normal launch (no shortcut)');
      }
    });
    const subscription = addShortcutListener((item) => {
      appendLog('warm', `Press event: ${formatItem(item)}`);
    });
    refreshActive();
    return () => subscription.remove();
  }, [appendLog, refreshActive]);

  const onSetShortcuts = useCallback(async () => {
    try {
      await setShortcuts(SAMPLE_SHORTCUTS);
      appendLog('info', `Registered ${SAMPLE_SHORTCUTS.length} shortcuts`);
      await refreshActive();
    } catch (error) {
      appendLog('info', `setShortcuts failed: ${String(error)}`);
    }
  }, [appendLog, refreshActive]);

  const onClearShortcuts = useCallback(async () => {
    await clearShortcuts();
    appendLog('info', 'Cleared all shortcuts');
    await refreshActive();
  }, [appendLog, refreshActive]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>App Shortcuts</Text>
      <Text style={styles.instructions}>
        1. Tap “Set shortcuts”.{'\n'}
        2. Background the app and long-press its icon on the home screen.{'\n'}
        3. Pick a quick action — the press is logged below.{'\n'}
        4. Swipe the app away and try again to see a cold-start press.
      </Text>

      <View style={styles.buttonRow}>
        <Pressable style={styles.button} onPress={onSetShortcuts}>
          <Text style={styles.buttonLabel}>Set shortcuts</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonSecondary]}
          onPress={onClearShortcuts}
        >
          <Text style={styles.buttonLabel}>Clear</Text>
        </Pressable>
      </View>

      <Text style={styles.activeLabel}>
        Active: {active.length > 0 ? active.join(', ') : 'none'}
      </Text>

      <Text style={styles.logHeading}>Press log</Text>
      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {log.length === 0 ? (
          <Text style={styles.logEmpty}>No shortcut presses yet.</Text>
        ) : (
          log.map((entry) => (
            <Text key={entry.key} style={styles.logEntry}>
              <Text style={styles.logTime}>{entry.time} </Text>
              <Text style={styles[entry.kind]}>[{entry.kind}] </Text>
              {entry.message}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 72,
    paddingHorizontal: 20,
    backgroundColor: '#f7f7fa',
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
    color: '#1c1c1e',
  },
  instructions: {
    fontSize: 14,
    lineHeight: 21,
    color: '#3a3a3c',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  button: {
    flex: 1,
    backgroundColor: '#3478f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#8e8e93',
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  activeLabel: {
    fontSize: 13,
    color: '#3a3a3c',
    marginBottom: 16,
  },
  logHeading: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1c1c1e',
  },
  log: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 24,
  },
  logContent: {
    padding: 12,
  },
  logEmpty: {
    color: '#8e8e93',
    fontSize: 13,
  },
  logEntry: {
    fontSize: 13,
    lineHeight: 20,
    color: '#1c1c1e',
  },
  logTime: {
    color: '#8e8e93',
  },
  cold: {
    color: '#af52de',
    fontWeight: '600',
  },
  warm: {
    color: '#ff9500',
    fontWeight: '600',
  },
  hook: {
    color: '#34c759',
    fontWeight: '600',
  },
  info: {
    color: '#8e8e93',
    fontWeight: '600',
  },
});
