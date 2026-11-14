import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  ButtonBase,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import EmojiEmotionsOutlinedIcon from "@mui/icons-material/EmojiEmotionsOutlined";
import EmojiPeopleOutlinedIcon from "@mui/icons-material/EmojiPeopleOutlined";
import EmojiSymbolsOutlinedIcon from "@mui/icons-material/EmojiSymbolsOutlined";
import FastfoodOutlinedIcon from "@mui/icons-material/FastfoodOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import FlightOutlinedIcon from "@mui/icons-material/FlightOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import PetsOutlinedIcon from "@mui/icons-material/PetsOutlined";
import SearchIcon from "@mui/icons-material/Search";
import SportsSoccerOutlinedIcon from "@mui/icons-material/SportsSoccerOutlined";
import { RADIUS } from "../../theme";
import type { CustomEmoji } from "@shared/emoji";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { CustomEmojiImage } from "./EmojiText";
import {
  EMOJI_GROUPS,
  SKIN_TONES,
  loadEmoji,
  searchEmoji,
  withTone,
  type EmojiEntry,
  type SkinTone,
} from "./emojiData";
import { readRecentEmoji, readSkinTone, rememberEmoji, writeSkinTone } from "./emojiPrefs";

const GROUP_ICONS: Record<number, React.ElementType> = {
  0: EmojiEmotionsOutlinedIcon,
  1: EmojiPeopleOutlinedIcon,
  3: PetsOutlinedIcon,
  4: FastfoodOutlinedIcon,
  5: FlightOutlinedIcon,
  6: SportsSoccerOutlinedIcon,
  7: LightbulbOutlinedIcon,
  8: EmojiSymbolsOutlinedIcon,
  9: FlagOutlinedIcon,
};

// Each tone's sample is the waving hand in that tone (0 is the default yellow).
const TONE_SAMPLES = ["👋", "👋🏻", "👋🏼", "👋🏽", "👋🏾", "👋🏿"];
const TONE_NAMES = ["Default", "Light", "Medium-light", "Medium", "Medium-dark", "Dark"];

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  autoFocus?: boolean;
  /** The custom emoji to offer here (the community's or the chat's), and what picking one does. */
  custom?: CustomEmoji[];
  onPickCustom?: (emoji: CustomEmoji) => void;
}

const cell = {
  width: 38,
  height: 38,
  borderRadius: RADIUS.md,
  fontSize: 22,
  lineHeight: 1,
  "&:hover, &:focus-visible": { bgcolor: "action.hover" },
} as const;

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(8, 38px)", justifyContent: "space-between" }}>
      {children}
    </Box>
  );
}

/**
 * Pick any emoji: a search box, the categories, the ones you used lately, and your skin tone. The data loads the first
 * time one is opened. Your recent picks and tone are remembered on this device.
 */
export default function EmojiPicker({ onPick, autoFocus, custom = [], onPickCustom }: EmojiPickerProps) {
  const [entries, setEntries] = useState<EmojiEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState<SkinTone>(() => readSkinTone());
  const [recent, setRecent] = useState<string[]>(() => readRecentEmoji());
  const [hovered, setHovered] = useState<string>("");
  const [toneOpen, setToneOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sections = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    let live = true;
    loadEmoji().then(
      (list) => live && setEntries(list),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const byGroup = useMemo(() => {
    const map = new Map<number, EmojiEntry[]>();
    for (const e of entries ?? []) map.set(e.group, [...(map.get(e.group) ?? []), e]);
    return map;
  }, [entries]);
  const results = useMemo(() => (entries && query.trim() ? searchEmoji(entries, query) : []), [entries, query]);
  const customResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? custom.filter((e) => e.name.includes(q)) : [];
  }, [custom, query]);
  const searching = query.trim().length > 0;

  const pick = (emoji: string) => {
    setRecent(rememberEmoji(emoji));
    onPick(emoji);
  };
  const chooseTone = (next: SkinTone) => {
    setTone(next);
    writeSkinTone(next);
    setToneOpen(false);
  };
  const jump = (key: string) => {
    setQuery("");
    // The sections are drawn again after the search clears, so wait a frame to scroll to the right one.
    requestAnimationFrame(() => sections.current.get(key)?.scrollIntoView({ block: "start" }));
  };

  const renderEntry = (e: EmojiEntry) => {
    const emoji = withTone(e, tone);
    return (
      <ButtonBase
        key={e.order}
        aria-label={e.label}
        title={e.label}
        onClick={() => pick(emoji)}
        onMouseEnter={() => setHovered(e.label)}
        onFocus={() => setHovered(e.label)}
        sx={cell}
      >
        {emoji}
      </ButtonBase>
    );
  };

  const hasCustom = custom.length > 0 && !!onPickCustom;
  const customButton = (e: CustomEmoji) => (
    <ButtonBase
      key={e._id}
      aria-label={`:${e.name}:`}
      title={`:${e.name}:`}
      onClick={() => onPickCustom?.(e)}
      onMouseEnter={() => setHovered(`:${e.name}:`)}
      onFocus={() => setHovered(`:${e.name}:`)}
      sx={cell}
    >
      <CustomEmojiImage emoji={e} size={1} />
    </ButtonBase>
  );
  const tabs = [
    ...(hasCustom ? [{ key: "custom", label: "Custom emoji", Icon: StarBorderIcon }] : []),
    ...(recent.length > 0 ? [{ key: "recent", label: "Recently used", Icon: AccessTimeIcon }] : []),
    ...EMOJI_GROUPS.map((g) => ({ key: String(g.id), label: g.label, Icon: GROUP_ICONS[g.id]! })),
  ];

  return (
    <Box
      sx={{
        width: { xs: "min(340px, calc(100vw - 32px))", sm: 340 },
        height: 400,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ p: 1, pb: 0.5 }}>
        <TextField
          fullWidth
          size="small"
          autoFocus={autoFocus}
          placeholder="Search emoji"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
            htmlInput: { "aria-label": "Search emoji" },
          }}
        />
      </Box>

      {!searching && (
        <Box
          sx={{ display: "flex", justifyContent: "space-between", px: 0.5, borderBottom: 1, borderColor: "divider" }}
        >
          {tabs.map(({ key, label, Icon }) => (
            <Tooltip key={key} title={label}>
              <IconButton size="small" aria-label={label} onClick={() => jump(key)}>
                <Icon fontSize="small" />
              </IconButton>
            </Tooltip>
          ))}
        </Box>
      )}

      <Box ref={scroller} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1, py: 0.5 }}>
        {failed ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
            Couldn&apos;t load the emoji. Check your connection and try again.
          </Typography>
        ) : !entries ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }} aria-busy>
            <CircularProgress size={24} />
          </Box>
        ) : searching ? (
          results.length === 0 && customResults.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
              No emoji match &ldquo;{query.trim()}&rdquo;.
            </Typography>
          ) : (
            <Grid>
              {hasCustom && customResults.map(customButton)}
              {results.map(renderEntry)}
            </Grid>
          )
        ) : (
          <>
            {hasCustom && (
              <Box
                ref={(el: HTMLElement | null) => {
                  if (el) sections.current.set("custom", el);
                }}
                sx={{ pb: 1 }}
              >
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 2 }}>
                  Custom emoji
                </Typography>
                <Grid>{custom.map(customButton)}</Grid>
              </Box>
            )}
            {recent.length > 0 && (
              <Box
                ref={(el: HTMLElement | null) => {
                  if (el) sections.current.set("recent", el);
                }}
                sx={{ pb: 1 }}
              >
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 2 }}>
                  Recently used
                </Typography>
                <Grid>
                  {recent.map((emoji) => (
                    <ButtonBase key={emoji} aria-label={emoji} onClick={() => pick(emoji)} sx={cell}>
                      {emoji}
                    </ButtonBase>
                  ))}
                </Grid>
              </Box>
            )}
            {EMOJI_GROUPS.map((group) => (
              <Box
                key={group.id}
                ref={(el: HTMLElement | null) => {
                  if (el) sections.current.set(String(group.id), el);
                }}
                sx={{ pb: 1, contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
              >
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 2 }}>
                  {group.label}
                </Typography>
                <Grid>{(byGroup.get(group.id) ?? []).map(renderEntry)}</Grid>
              </Box>
            ))}
          </>
        )}
      </Box>

      <Box
        sx={{
          borderTop: 1,
          borderColor: "divider",
          px: 1,
          py: 0.5,
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        {toneOpen ? (
          <Box sx={{ display: "flex", gap: 0.5, flex: 1 }} role="radiogroup" aria-label="Skin tone">
            {SKIN_TONES.map((t) => (
              <ButtonBase
                key={t}
                role="radio"
                aria-checked={tone === t}
                aria-label={`${TONE_NAMES[t]} skin tone`}
                onClick={() => chooseTone(t)}
                sx={{
                  ...cell,
                  bgcolor: tone === t ? (th: Theme) => alpha(th.palette.primary.main, 0.2) : undefined,
                }}
              >
                {TONE_SAMPLES[t]}
              </ButtonBase>
            ))}
          </Box>
        ) : (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ flex: 1, "&::first-letter": { textTransform: "uppercase" } }}
          >
            {hovered || "Pick an emoji"}
          </Typography>
        )}
        <Tooltip title="Skin tone">
          <IconButton
            size="small"
            aria-label="Skin tone"
            aria-expanded={toneOpen}
            onClick={() => setToneOpen((v) => !v)}
            sx={{ fontSize: 20 }}
          >
            {TONE_SAMPLES[tone]}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
