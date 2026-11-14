import { useCall } from "../../contexts/CallContext";
import CallScreen, { RemoteAudio } from "./CallScreen";
import CallPill from "./CallPill";
import IncomingCallBanner from "./IncomingCallBanner";

/** Everything a call puts over the app: the ring, the call screen or its small pill, and the sound. Mounted once at the root. */
export default function CallOverlay() {
  const { active } = useCall();
  return (
    <>
      <RemoteAudio />
      <IncomingCallBanner />
      {active && <CallScreen />}
      <CallPill />
    </>
  );
}
