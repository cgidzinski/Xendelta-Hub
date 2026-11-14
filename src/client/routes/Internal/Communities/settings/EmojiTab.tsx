import type { Community } from "@shared/communities";
import CustomEmojiManager from "../../../../components/emoji/CustomEmojiManager";
import SectionCard from "../../../../components/ui/SectionCard";

/** The community's own emoji. People with the manage emoji permission can add, rename and remove them. */
export default function EmojiTab({ community }: { community: Community }) {
  return (
    <SectionCard
      title="Custom emoji"
      description="Pictures people in this community can use as :name: in messages and as reactions."
    >
      <CustomEmojiManager scope={{ type: "community", id: community._id }} canAdd canChange={() => true} />
    </SectionCard>
  );
}
