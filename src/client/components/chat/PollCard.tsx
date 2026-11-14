import { useEffect, useState } from "react";
import { Box, ButtonBase, Button, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import { isPollClosed, type ChatPoll } from "@shared/chat";
import { dayLabel, clock, type PeopleLookup } from "../../routes/Internal/Messages/chatUi";

interface Props {
  poll: ChatPoll;
  meId: string;
  lookup: PeopleLookup;
  /** Choose these options (an empty list takes the vote back). */
  onVote: (optionIds: string[]) => void;
  /** Present only for whoever may close it early. */
  onClose?: () => void;
  busy?: boolean;
}

/** A poll in a message: the options as bars with their counts, tapped to vote. It locks itself at its end time. */
export default function PollCard({ poll, meId, lookup, onVote, onClose, busy }: Props) {
  // Re-draw at the end time so a poll closes on screen without a refresh.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!poll.endsAt || poll.closedAt) return;
    const wait = new Date(poll.endsAt).getTime() - Date.now();
    if (wait <= 0 || wait > 2 ** 31 - 1) return;
    const t = setTimeout(() => tick((n) => n + 1), wait + 50);
    return () => clearTimeout(t);
  }, [poll.endsAt, poll.closedAt]);

  const closed = isPollClosed(poll);
  const mine = new Set(poll.options.filter((o) => o.userIds.includes(meId)).map((o) => o.id));
  const voters = new Set(poll.options.flatMap((o) => o.userIds));
  const top = Math.max(0, ...poll.options.map((o) => o.userIds.length));

  const choose = (id: string) => {
    if (closed || busy) return;
    if (poll.multiple) onVote(mine.has(id) ? [...mine].filter((x) => x !== id) : [...mine, id]);
    else onVote(mine.has(id) ? [] : [id]);
  };

  const names = (ids: string[]) =>
    ids.length === 0
      ? "No votes yet"
      : ids.map((id) => (id === meId ? "You" : (lookup(id)?.username ?? "Someone"))).join(", ");

  return (
    <Box
      role={poll.multiple ? "group" : "radiogroup"}
      aria-label={`Poll: ${poll.question}`}
      sx={{ mt: 0.5, p: 1.5, border: 1, borderColor: "divider", borderRadius: 2, width: 360, maxWidth: "100%" }}
    >
      <Typography sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{poll.question}</Typography>
      <Typography variant="caption" color="text.secondary">
        {poll.multiple ? "Choose as many as you like" : "Choose one"}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: 1 }}>
        {poll.options.map((o) => {
          const count = o.userIds.length;
          const percent = voters.size > 0 ? Math.round((count / voters.size) * 100) : 0;
          const chosen = mine.has(o.id);
          const Icon = poll.multiple
            ? chosen
              ? CheckBoxIcon
              : CheckBoxOutlineBlankIcon
            : chosen
              ? RadioButtonCheckedIcon
              : RadioButtonUncheckedIcon;
          return (
            <Tooltip key={o.id} title={names(o.userIds)} placement="top">
              <ButtonBase
                role={poll.multiple ? "checkbox" : "radio"}
                aria-checked={chosen}
                aria-label={`${o.text}, ${count} ${count === 1 ? "vote" : "votes"}`}
                disabled={closed || busy}
                onClick={() => choose(o.id)}
                sx={{
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  width: "100%",
                  textAlign: "left",
                  px: 1,
                  py: 0.75,
                  borderRadius: 1.5,
                  border: 1,
                  borderColor: chosen ? "primary.main" : "divider",
                  "&.Mui-disabled": { opacity: 1 },
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    position: "absolute",
                    inset: 0,
                    width: `${percent}%`,
                    bgcolor: (t) => alpha(t.palette.primary.main, closed && count === top && count > 0 ? 0.3 : 0.14),
                    transition: "width 0.3s",
                    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
                  }}
                />
                <Icon fontSize="small" color={chosen ? "primary" : "disabled"} sx={{ position: "relative" }} />
                <Typography variant="body2" sx={{ position: "relative", flex: 1, overflowWrap: "anywhere" }}>
                  {o.text}
                </Typography>
                <Typography variant="caption" sx={{ position: "relative", fontVariantNumeric: "tabular-nums" }}>
                  {count} · {percent}%
                </Typography>
              </ButtonBase>
            </Tooltip>
          );
        })}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {voters.size} {voters.size === 1 ? "person has" : "people have"} voted ·{" "}
          {poll.closedAt
            ? "Closed"
            : poll.endsAt
              ? closed
                ? "Closed"
                : `Ends ${dayLabel(poll.endsAt)}, ${clock(poll.endsAt)}`
              : "Open until closed"}
        </Typography>
        {onClose && !closed && (
          <Button size="small" onClick={onClose} sx={{ textTransform: "none" }}>
            Close poll
          </Button>
        )}
      </Box>
    </Box>
  );
}
