import SectionCard from "../../../components/ui/SectionCard";
import AppearanceSection from "./components/AppearanceSection";

/** Light or dark, or follow the device. */
export default function AppearanceTab() {
  return (
    <SectionCard title="Theme" description="Dark unless you choose otherwise, or follow your device's setting.">
      <AppearanceSection />
    </SectionCard>
  );
}
