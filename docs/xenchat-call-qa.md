# XenChat call and chat QA

Use a test deployment with Cloudflare Realtime and TURN configured. Sign in to separate test accounts, add them to a group chat and a community voice channel, and make sure the account or community paying for calls has gems. Install the PWA and allow notifications on the receiving device for the push check.

| Check | Steps | Expected result |
| --- | --- | --- |
| Cross-network call | Join the same call from Wi-Fi and from a phone with Wi-Fi off. Test speech and video in both directions. | Both participants can hear and see each other. Confirm the phone’s default camera quality when the browser reports a cellular or data-saving connection. |
| Group call and voice channel | Join with three or more accounts. Have participants speak in turn, mute, turn off a camera, and leave. Minimise the call to open the voice-channel sidebar. | The grid updates as people come and go. The current speaker has a ring and an icon. Listeners in the same voice channel see the speaking indicator in its sidebar. |
| Screen share | Share a window or tab from desktop Chrome, Firefox, and Safari. Check on a phone as a viewer. Stop from the browser’s own share controls. | Viewers see the whole shared image, with the participant strip beside or below it. The camera grid returns when sharing stops. Browsers without screen capture omit the share button. |
| Network handoff | Mute the phone and switch from Wi-Fi to mobile data mid-call. Repeat with the call minimised, then repeat unmuted. | Brief drops may recover on their own. If the app opens a fresh session, it keeps the selected devices and mute state. The other participants stay in the call during a brief signalling disconnect. Record recovery time and whether media returns in both directions. |
| Device and quality changes | Switch between two microphones and cameras on each desktop browser. Try both camera quality settings in the same call. | The settings reflect the actual device in use. Switching the microphone preserves mute. Camera quality changes without leaving the call. |
| Incoming call notification | Close the recipient’s installed PWA and any open tabs. Start a direct call from a second account. Open the notification while the call is ringing. | The device receives a call notification. Opening it lands in the chat with a way to join the ongoing call. |
| Voice messages | On iOS Safari and Android Chrome, grant microphone access, hold and release, tap and use Send, and cancel. Repeat after denying permission and after switching chats while the permission prompt is open. | A deliberate hold sends on release. A tap opens recording controls. Cancelling or leaving discards the recording and releases the microphone. Sent recordings play back on both platforms. |
| GIFs | With a test GIPHY key configured on the server, search for a GIF and send it to another account. | Results appear in the picker, and the sent GIF displays and plays for the recipient. |

The data-saver preset caps the outgoing camera at 360p, 15 fps and 400 kbps. Screen sharing and audio have their own caps. Validate Cloudflare’s layer selection across browsers before enabling simulcast. Compare actual handoff results before changing the fresh-session fallback to ICE restart.

Keep thread replies in the conversation unread total until there is a separate unread indicator for threads. A reply is hidden from the main timeline, so removing it from the total today would leave followers relying on push or opening the thread to discover it.
