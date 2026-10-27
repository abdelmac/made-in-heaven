import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  enabled: true,
  platform: 'android',
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  checkExactNotificationSetting: vi.fn(),
  changeExactNotificationSetting: vi.fn(),
}));

vi.mock('@/lib/mobile-platform', () => ({ isNativeApp: () => native.enabled }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => native.platform } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: native }));

import {
  nativeNotificationPermission,
  openNativeExactAlarmSettings,
  requestNativeNotifications,
} from '../src/lib/native-notifications';

beforeEach(() => {
  vi.clearAllMocks();
  native.enabled = true;
  native.platform = 'android';
  native.checkPermissions.mockResolvedValue({ display: 'granted' });
  native.requestPermissions.mockResolvedValue({ display: 'granted' });
  native.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' });
  native.changeExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' });
});

describe('native notification permission actions', () => {
  it('never invokes native permissions in the website', async () => {
    native.enabled = false;
    expect(await nativeNotificationPermission()).toBe(false);
    expect(await requestNativeNotifications()).toEqual({ granted: false, exact: false });
    await openNativeExactAlarmSettings();
    expect(native.checkPermissions).not.toHaveBeenCalled();
    expect(native.requestPermissions).not.toHaveBeenCalled();
    expect(native.changeExactNotificationSetting).not.toHaveBeenCalled();
  });

  it('reads display permission without prompting or opening settings', async () => {
    expect(await nativeNotificationPermission()).toBe(true);
    expect(native.requestPermissions).not.toHaveBeenCalled();
    expect(native.changeExactNotificationSetting).not.toHaveBeenCalled();
  });

  it('reports denied display permission without requesting exact alarms', async () => {
    native.requestPermissions.mockResolvedValue({ display: 'denied' });
    const result = await requestNativeNotifications();
    expect(result.granted).toBe(false);
    expect(result.message).toContain('ne sont pas autorisées');
    expect(native.checkExactNotificationSetting).not.toHaveBeenCalled();
    expect(native.changeExactNotificationSetting).not.toHaveBeenCalled();
  });

  it('keeps ordinary notifications enabled when optional Android precision is unavailable', async () => {
    native.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' });
    expect(await requestNativeNotifications()).toMatchObject({ granted: true, exact: false });
    native.checkExactNotificationSetting.mockRejectedValue(new Error('Unsupported OS setting'));
    const result = await requestNativeNotifications();
    expect(result).toMatchObject({ granted: true, exact: false });
    expect(result.message).toContain('Android peut les décaler');
    expect(native.changeExactNotificationSetting).not.toHaveBeenCalled();
  });

  it('does not invoke Android-only settings on iOS', async () => {
    native.platform = 'ios';
    expect(await requestNativeNotifications()).toEqual({ granted: true, exact: true });
    await openNativeExactAlarmSettings();
    expect(native.checkExactNotificationSetting).not.toHaveBeenCalled();
    expect(native.changeExactNotificationSetting).not.toHaveBeenCalled();
  });

  it('opens the Android exact-alarm screen only through its explicit action', async () => {
    await openNativeExactAlarmSettings();
    expect(native.changeExactNotificationSetting).toHaveBeenCalledOnce();
    expect(native.requestPermissions).not.toHaveBeenCalled();
  });

  it('turns a device failure into a useful message without rejecting the user action', async () => {
    native.requestPermissions.mockRejectedValue(new Error('Device interrupted'));
    const result = await requestNativeNotifications();
    expect(result.granted).toBe(false);
    expect(result.message).toContain('Le minuteur reste disponible');
  });
});
