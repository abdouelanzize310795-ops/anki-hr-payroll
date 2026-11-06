import * as Application from "expo-application";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { secureClock } from "@/lib/api/mobile";
import type { MobileSecureClockResult } from "@/lib/api/types";

export type DeviceInfo = { deviceId: string; platform: string; model: string | null };

export async function getDeviceInfo(): Promise<DeviceInfo> {
  let deviceId: string | null = null;
  try {
    deviceId =
      Platform.OS === "android"
        ? Application.getAndroidId()
        : await Application.getIosIdForVendorAsync();
  } catch {
    deviceId = null;
  }
  return {
    deviceId: deviceId ?? `${Platform.OS}-unknown`,
    platform: Platform.OS,
    model: Application.nativeApplicationVersion
      ? `${Platform.OS === "android" ? "Android" : "iOS"} ${Platform.Version}`
      : null,
  };
}

export type Fix = { lat: number; lng: number; accuracy: number | null; mocked: boolean };

/**
 * Asks for location permission, then watches high-accuracy positions for up to
 * `timeoutMs` and returns the most precise reading (stops early once ≤ targetM).
 */
export async function getAccurateFix(
  onProgress?: (accuracy: number | null) => void,
  { timeoutMs = 10_000, targetM = 20 } = {},
): Promise<Fix> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Activez la localisation pour Mshahara (Paramètres › Applications › Mshahara › Autorisations).");
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error("La localisation du téléphone est désactivée. Activez-la pour pointer.");
  }

  return new Promise<Fix>((resolve, reject) => {
    let best: Location.LocationObject | null = null;
    let sub: Location.LocationSubscription | null = null;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      sub?.remove();
      clearTimeout(timer);
      if (!best) {
        reject(new Error("Position introuvable. Sortez près d’une fenêtre et réessayez."));
        return;
      }
      resolve({
        lat: best.coords.latitude,
        lng: best.coords.longitude,
        accuracy: best.coords.accuracy ?? null,
        mocked: Boolean(best.mocked),
      });
    };

    const timer = setTimeout(finish, timeoutMs);

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (pos) => {
        if (!best || (pos.coords.accuracy ?? 9999) < (best.coords.accuracy ?? 9999)) best = pos;
        onProgress?.(best.coords.accuracy ?? null);
        if ((best.coords.accuracy ?? 9999) <= targetM) finish();
      },
    )
      .then((s) => {
        sub = s;
        if (done) s.remove();
      })
      .catch((e) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error("Localisation impossible"));
        }
      });
  });
}

/** Full clock flow: device id + precise location + optional QR token → server checks. */
export async function clockWithChecks(
  qrToken: string | null,
  onProgress?: (accuracy: number | null) => void,
): Promise<MobileSecureClockResult> {
  const [device, fix] = await Promise.all([getDeviceInfo(), getAccurateFix(onProgress)]);
  return secureClock({
    deviceId: device.deviceId,
    platform: device.platform,
    model: device.model,
    lat: fix.lat,
    lng: fix.lng,
    accuracyM: fix.accuracy,
    isMock: fix.mocked,
    qrToken,
  });
}
