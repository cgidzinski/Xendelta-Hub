import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { createAppTheme } from "../../../../theme";
import CoverField from "./CoverField";

const render = (props: Partial<React.ComponentProps<typeof CoverField>>) =>
  renderToStaticMarkup(
    <ThemeProvider theme={createAppTheme("light")}>
      <CoverField
        preview={{ icon: "restaurant", color: "#ff8a65", cover_url: null }}
        onPick={() => {}}
        onRemove={() => {}}
        {...props}
      />
    </ThemeProvider>,
  );

describe("the cover field", () => {
  it("offers Add cover and no Remove while there is no picture", () => {
    const html = render({});
    expect(html).toContain("Add cover");
    expect(html).not.toContain("Remove");
    expect(html).toContain('accept="image/*"');
  });

  it("offers Change cover and Remove once there is one, and shows the picture", () => {
    const html = render({
      preview: { icon: "restaurant", color: "#ff8a65", cover_url: "https://example.test/c.webp" },
    });
    expect(html).toContain("Change cover");
    expect(html).toContain("Remove");
    expect(html).toContain("https://example.test/c.webp");
  });

  it("disables the buttons and shows progress while sending", () => {
    const html = render({ busy: true, percent: 40 });
    expect(html).toContain("Uploading cover");
    expect(html).toContain("40%");
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
