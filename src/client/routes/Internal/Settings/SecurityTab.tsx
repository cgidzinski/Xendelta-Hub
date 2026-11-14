import { Stack } from "@mui/material";
import SectionCard from "../../../components/ui/SectionCard";
import AuthProviderManager from "./components/AuthProviderManager";
import ApiKeysSection from "./components/ApiKeysSection";

/** How you sign in, and the personal keys scripts and other apps use instead. */
export default function SecurityTab() {
  return (
    <Stack spacing={2}>
      <SectionCard
        title="Sign-in methods"
        description="Every way you can get into this account. Add a password if you signed up with Google, GitHub or Discord."
      >
        <AuthProviderManager />
      </SectionCard>

      <SectionCard
        title="API keys"
        description="Let a script or another app call your apps' routes without signing in. A key can be revoked at any time."
      >
        <ApiKeysSection />
      </SectionCard>
    </Stack>
  );
}
