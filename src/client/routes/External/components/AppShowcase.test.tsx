import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { createAppTheme } from "../../../theme";
import { APPS_REGISTRY } from "../../../constants/apps";
import AppShowcase, { showcaseApps } from "./AppShowcase";

// The public pages list the apps from the app registry and the guide, so a new app appears on them without anyone editing a page.
describe("the apps on the public pages", () => {
  it("is every registered app", () => {
    expect(showcaseApps().map((a) => a.key)).toEqual(APPS_REGISTRY.map((a) => a.key));
  });

  it("shows each app's name and what it is for", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider theme={createAppTheme("dark")}>
        <AppShowcase />
      </ThemeProvider>,
    );
    for (const app of APPS_REGISTRY) expect(html, app.label).toContain(app.label);
    expect(html).toContain("keeping your paint recipes");
  });
});
