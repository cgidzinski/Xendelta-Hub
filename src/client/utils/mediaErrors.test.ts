import { describe, expect, it } from "vitest";
import { mediaErrorText } from "./mediaErrors";

const err = (name: string) => Object.assign(new Error("x"), { name });
const desktop = { ios: false, standalone: false };
const iphone = { ios: true, standalone: false };
const homeScreen = { ios: true, standalone: true };

describe("mediaErrorText", () => {
  it("tells an iPhone in Safari where the site setting is", () => {
    const text = mediaErrorText(err("NotAllowedError"), "microphone and camera", iphone);
    expect(text).toContain("Website Settings");
    expect(text).toContain("Microphone and Camera");
  });

  it("points the home-screen app at Safari's settings", () => {
    expect(mediaErrorText(err("NotAllowedError"), "microphone", homeScreen)).toContain("Settings › Apps › Safari");
  });

  it("keeps the browser wording elsewhere", () => {
    expect(mediaErrorText(err("SecurityError"), "camera", desktop)).toContain("Your browser blocked the camera");
  });

  it("tells a busy or missing device apart from a blocked one", () => {
    expect(mediaErrorText(err("NotReadableError"), "microphone", iphone)).toContain("being used by something else");
    expect(mediaErrorText(err("NotFoundError"), "camera", desktop)).toBe("No camera was found on this device.");
  });

  it("leaves other errors to the caller", () => {
    expect(mediaErrorText(new Error("network"), "microphone", desktop)).toBeNull();
    expect(mediaErrorText(undefined, "microphone", desktop)).toBeNull();
  });
});
