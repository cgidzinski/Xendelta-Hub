import { Navigate } from "react-router-dom";
import { lastChatPlace } from "../../../utils/chatLastPlace";

/** The Chat button: reopens the DM or channel the person was last in, else their direct messages. */
export default function ChatHome() {
  return <Navigate replace to={lastChatPlace() ?? "/internal/messages"} />;
}
