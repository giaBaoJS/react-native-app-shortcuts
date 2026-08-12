import { TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * A single home-screen shortcut (quick action).
 */
export type ShortcutItem = {
  /**
   * Unique identifier for the shortcut. Returned when the shortcut is pressed.
   */
  id: string;
  /**
   * Title shown under the shortcut (iOS: `localizedTitle`, Android: `shortLabel`).
   */
  title: string;
  /**
   * Optional subtitle (iOS: `localizedSubtitle`; Android: used as `longLabel`).
   */
  subtitle?: string;
  /**
   * Optional icon. iOS: an SF Symbol name (e.g. `"star.fill"`).
   * Android: the name of a drawable resource bundled in the host app.
   */
  iconName?: string;
  /**
   * Arbitrary string payload returned when the shortcut is pressed.
   */
  data?: { [key: string]: string };
};

export interface Spec extends TurboModule {
  setShortcuts(shortcuts: Array<ShortcutItem>): Promise<void>;
  clearShortcuts(): Promise<void>;
  getShortcuts(): Promise<Array<ShortcutItem>>;
  getInitialShortcut(): Promise<ShortcutItem | null>;

  // Classic event-emitter plumbing (used by NativeEventEmitter on the JS side).
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AppShortcuts');
