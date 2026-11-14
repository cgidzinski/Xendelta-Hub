// What to tell someone when the browser won't give us the microphone or camera. "Allow it in your browser" is no help on
// an iPhone: once a site is set to Deny (or "Don't Allow" was tapped), Safari refuses without asking again, and the
// switch to turn it back on is somewhere they would never look. So say where it is, and tell a device that is busy or
// missing apart from one that is blocked.

export interface MediaPlatform {
  /** An iPhone or iPad (any browser there is Safari underneath). */
  ios: boolean;
  /** Opened from the home screen rather than in Safari. */
  standalone: boolean;
}

export function currentPlatform(): MediaPlatform {
  if (typeof navigator === "undefined") return { ios: false, standalone: false };
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS asks for the desktop site and says it is a Mac.
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window !== "undefined" && !!window.matchMedia?.("(display-mode: standalone)").matches);
  return { ios, standalone };
}

/** "microphone", "camera" or "microphone and camera": what was asked for, in the words of the message. */
export type MediaWanted = "microphone" | "camera" | "microphone and camera";

const settingNames: Record<MediaWanted, string> = {
  microphone: "Microphone",
  camera: "Camera",
  "microphone and camera": "Microphone and Camera",
};

/**
 * The message for a failed `getUserMedia`, or null when the error isn't the browser refusing or failing to give the
 * device (so the caller can fall back to its own text).
 */
export function mediaErrorText(
  e: unknown,
  wanted: MediaWanted,
  platform: MediaPlatform = currentPlatform(),
): string | null {
  const name = (e as { name?: unknown } | null)?.name;
  const setting = settingNames[wanted];
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      if (platform.ios && platform.standalone)
        return `Your iPhone blocked the ${wanted}. Open Settings › Apps › Safari, set ${setting} to Ask or Allow, then close and reopen the app.`;
      if (platform.ios)
        return `Your iPhone blocked the ${wanted} for this site. Tap the page menu (aA) next to the address › Website Settings, set ${setting} to Ask or Allow, then try again.`;
      return `Your browser blocked the ${wanted} for this site. Allow it from the icon next to the address, then try again.`;
    case "NotReadableError":
    case "AbortError":
      return `The ${wanted} is being used by something else (another app, tab or phone call). Close it and try again.`;
    case "NotFoundError":
    case "OverconstrainedError":
      return `No ${wanted} was found on this device.`;
    default:
      return null;
  }
}
