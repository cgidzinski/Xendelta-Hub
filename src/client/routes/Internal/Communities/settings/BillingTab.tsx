import { useState } from "react";
import { Avatar, Box, Button, TextField, Typography } from "@mui/material";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { useSnackbar } from "notistack";
import type { Community } from "@shared/communities";
import { formatWholeGems, type FundHistoryEntry } from "@shared/billing";
import BillingView, { coverageText, monthName } from "../../../../components/billing/BillingView";
import GemAmount from "../../../../components/GemAmount";
import SectionLabel from "../../../../components/ui/SectionLabel";
import EmptyState from "../../../../components/ui/EmptyState";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import { useCommunityBilling, useCommunityFund, useDonate } from "../../../../hooks/billing/useBilling";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import { initialsOf } from "../communityUi";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function DonateDialog({ community, open, onClose }: { community: Community; open: boolean; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const { profile } = useUserProfile();
  const donate = useDonate(community._id);
  const [amount, setAmount] = useState("");
  const gems = Number(amount);
  const have = profile?.gems ?? 0;
  const problem =
    amount === ""
      ? null
      : !Number.isInteger(gems) || gems < 1
        ? "Donate whole gems, at least 1"
        : gems > have
          ? `You have ${formatWholeGems(have)}`
          : null;

  const submit = async () => {
    try {
      await donate.mutateAsync(gems);
      enqueueSnackbar(`Thanks! ${formatWholeGems(gems)} added to ${community.name}'s fund`, { variant: "success" });
      setAmount("");
      onClose();
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't donate", { variant: "error" });
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title="Donate gems"
      maxWidth="xs"
      fullWidth
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" disabled={!amount || !!problem || donate.isPending} onClick={submit}>
            Donate
          </Button>
        </>
      }
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Gems you give go into {community.name}'s fund and pay its monthly bill. They can't be taken back.
      </Typography>
      <TextField
        autoFocus
        fullWidth
        label="Gems"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={!!problem}
        helperText={problem ?? `You have ${formatWholeGems(have)}`}
        slotProps={{ htmlInput: { min: 1, step: 1, inputMode: "numeric" } }}
      />
    </ResponsiveDialog>
  );
}

function HistoryRow({ entry, first }: { entry: FundHistoryEntry; first: boolean }) {
  const label =
    entry.kind === "donation"
      ? `${entry.by?.username ?? "Someone"} donated`
      : entry.kind === "bill"
        ? `${entry.month ? monthName(entry.month).split(" ")[0] : "Monthly"} bill paid`
        : entry.amount > 0
          ? "Gems added"
          : "Gems taken";
  return (
    <Box
      sx={{
        px: 2.5,
        py: 1.5,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        borderTop: first ? 0 : 1,
        borderColor: "divider",
      }}
    >
      {entry.kind === "donation" ? (
        <Avatar src={entry.by?.avatar} alt="" sx={{ width: 32, height: 32, fontSize: 13 }}>
          {initialsOf(entry.by?.username ?? "?")}
        </Avatar>
      ) : (
        <Avatar sx={{ width: 32, height: 32, bgcolor: "action.selected", color: "text.secondary" }}>
          <ReceiptLongOutlinedIcon sx={{ fontSize: 16 }} />
        </Avatar>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {shortDate(entry.at)}
        </Typography>
      </Box>
      <Typography variant="body2" color={entry.amount > 0 ? "success.main" : "text.primary"}>
        {entry.amount > 0 ? "+" : "−"}
        {Math.abs(entry.amount).toLocaleString("en-US")}
      </Typography>
    </Box>
  );
}

/** A community's bill, for every member: what it used this month, its fund and where the gems went. */
export default function BillingTab({ community }: { community: Community }) {
  const billing = useCommunityBilling(community._id);
  const fund = useCommunityFund(community._id);
  const [donating, setDonating] = useState(false);

  if (billing.isLoading) return <ListSkeleton rows={4} height={96} />;
  if (billing.error) return <ErrorDisplay error={billing.error as Error} title="Couldn't load the community's bill" />;
  const overview = billing.data;
  if (!overview) return null;
  const history = fund.data?.history ?? [];

  return (
    <Box sx={{ mt: 2.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Everyone in {community.name} can see this. The community's bill is paid from its fund, which members chip in to.
      </Typography>
      <BillingView
        overview={overview}
        paidFrom="the fund"
        communityName={community.name}
        balanceCard={
          <Box component="section" sx={{ ...cardSx, p: 2.5 }}>
            <SectionLabel>Community fund</SectionLabel>
            <GemAmount amount={overview.balance} variant="h5" iconSize={26} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {overview.donationsOpen
                ? coverageText(overview)
                : "Donations open when something starts to cost the community gems."}
            </Typography>
            {overview.donationsOpen && (
              <Button variant="contained" size="small" sx={{ mt: 1.5 }} onClick={() => setDonating(true)}>
                Donate gems
              </Button>
            )}
          </Box>
        }
      >
        <Box component="section" sx={{ ...cardSx }}>
          <Typography
            component="h2"
            variant="subtitle1"
            sx={{ fontWeight: 600, px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}
          >
            Fund history
          </Typography>
          {history.length === 0 ? (
            <EmptyState title="Nothing yet" description="Donations and bill payments will show here." sx={{ py: 4 }} />
          ) : (
            history.map((entry, i) => <HistoryRow key={entry._id} entry={entry} first={i === 0} />)
          )}
        </Box>
      </BillingView>
      {overview.donationsOpen && (
        <DonateDialog community={community} open={donating} onClose={() => setDonating(false)} />
      )}
    </Box>
  );
}
