import { useNavigate } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import ErrorDisplay from "../../../components/ErrorDisplay";
import GemAmount from "../../../components/GemAmount";
import SectionLabel from "../../../components/ui/SectionLabel";
import { cardSx } from "../../../components/ui/surfaceStyles";
import BillingView, { coverageText, monthName } from "../../../components/billing/BillingView";
import { useMyBilling } from "../../../hooks/billing/useBilling";
import { useTitle } from "../../../hooks/useTitle";

/** Your own bill: what you've used this month, by kind of use, and what it costs. */
export default function Billing() {
  useTitle("Billing");
  const navigate = useNavigate();
  const { data, isLoading, error } = useMyBilling();

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Billing"
        subtitle="What you've used this month and what it costs."
        actions={
          data && (
            <Typography variant="body2" color="text.secondary">
              {monthName(data.month)}
            </Typography>
          )
        }
      />
      {isLoading && <ListSkeleton rows={4} height={96} />}
      {error && <ErrorDisplay error={error as Error} title="Couldn't load your bill" />}
      {data && (
        <BillingView
          overview={data}
          paidFrom="your gems"
          balanceCard={
            <Box component="section" sx={{ ...cardSx, p: 2.5 }}>
              <SectionLabel>Your gems</SectionLabel>
              <GemAmount amount={data.balance} variant="h5" iconSize={26} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {coverageText(data)}
              </Typography>
              <Button variant="contained" size="small" sx={{ mt: 1.5 }} onClick={() => navigate("/internal/shop")}>
                Get gems
              </Button>
            </Box>
          }
        />
      )}
      {data && (
        <Box component="section" sx={{ ...cardSx, p: 2.5 }}>
          <SectionLabel>Storage</SectionLabel>
          <Typography variant="body2" color="text.secondary">
            See which apps use your space, and free it up.
          </Typography>
          <Button variant="outlined" size="small" sx={{ mt: 1.5 }} onClick={() => navigate("/internal/storage")}>
            See where your storage is used
          </Button>
        </Box>
      )}
    </PageContainer>
  );
}
