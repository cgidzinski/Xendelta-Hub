import { describe, it, expect } from "vitest";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Route, createRoutesFromElements, matchRoutes } from "react-router-dom";
import { APPS_REGISTRY } from "../constants/apps";
import { recipaintRoutes } from "./Internal/Recipaint/routes";
import { xendriveRoutes } from "./Internal/XenDrive/routes";
import { xenlinkRoutes } from "./Internal/XenLink/routes";
import { xensplitRoutes } from "./Internal/Xensplit/routes";
import { xenroutineRoutes } from "./Internal/XenRoutine/routes";
import { xenkitchenRoutes } from "./Internal/XenKitchen/routes";
import { xenbudgetRoutes } from "./Internal/XenBudget/routes";
import { xennoteRoutes } from "./Internal/XenNote/routes";

// Every app in the registry (nav bar, home screen, pinning) must have routes, and the route
// groups must be the ones main.tsx mounts. Adding an app: add its registry entry, a routes.tsx,
// list it here and mount it in main.tsx.
const ROUTES: Record<string, ReactNode> = {
  recipaint: recipaintRoutes,
  xendrive: xendriveRoutes,
  xenlink: xenlinkRoutes,
  xensplit: xensplitRoutes,
  xenroutine: xenroutineRoutes,
  xenkitchen: xenkitchenRoutes,
  xenbudget: xenbudgetRoutes,
  xennote: xennoteRoutes,
};

// Top-level paths only: nested routes are relative to their parent.
function paths(node: ReactNode): string[] {
  const out: string[] = [];
  Children.forEach(node, (child) => {
    if (!isValidElement<{ path?: string; children?: ReactNode }>(child)) return;
    if (child.type === Fragment) out.push(...paths(child.props.children));
    else if (child.props.path) out.push(child.props.path);
  });
  return out;
}

describe("app routes", () => {
  it("every registry app has a route group, and every route group is a registry app", () => {
    expect(Object.keys(ROUTES).sort()).toEqual(APPS_REGISTRY.map((a) => a.key).sort());
  });

  it("each group's routes live under the app's own path", () => {
    for (const app of APPS_REGISTRY) {
      const found = paths(ROUTES[app.key]);
      expect(found.length, app.key).toBeGreaterThan(0);
      const root = app.path.replace("/internal/", "");
      for (const p of found) expect(p === root || p.startsWith(root + "/"), `${app.key}: ${p}`).toBe(true);
    }
  });

  it("the router resolves real URLs through the grouped routes", () => {
    const tree = createRoutesFromElements(<Route path="/internal">{Object.values(ROUTES)}</Route>);
    const hit = (url: string) =>
      matchRoutes(tree, url)
        ?.map((m) => m.route.path)
        .filter(Boolean);
    expect(hit("/internal/xensplit/groups/abc/expenses")).toEqual([
      "/internal",
      "xensplit/groups/:groupId",
      "expenses",
    ]);
    expect(hit("/internal/xenbudget/books/abc/settings/flags")).toEqual([
      "/internal",
      "xenbudget",
      "books/:bookId",
      "settings",
      "flags",
    ]);
    expect(hit("/internal/xenroutine/routines")).toEqual(["/internal", "xenroutine", "routines"]);
    expect(hit("/internal/xenkitchen/abc")).toEqual(["/internal", "xenkitchen/:id"]);
    expect(hit("/internal/recipaint/abc/paint")).toEqual(["/internal", "recipaint/:id/paint"]);
    expect(hit("/internal/xendrive/file/f1")).toEqual(["/internal", "xendrive/file/:fileId"]);
    expect(hit("/internal/xendrive/folder/d1")).toEqual(["/internal", "xendrive/folder/:folderId"]);
    expect(hit("/internal/xennote")).toEqual(["/internal", "xennote"]);
    expect(hit("/internal/nowhere")).toBeUndefined();
  });
});
