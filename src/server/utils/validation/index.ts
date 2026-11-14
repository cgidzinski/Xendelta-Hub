// Request validation: the middleware and schemas for every route.
//
// `core.ts` holds the middleware (validate / validateParams / validateQuery) and the schemas that
// predate this split; newer schemas live in one file per area. Everything is re-exported here, so
// routes keep importing from "../utils/validation".
export * from "./core";
export * from "./links";
export * from "./paints";
export * from "./account";
export * from "./shop";
export * from "./xendrive";
export * from "./xenkitchenPlan";
export * from "./recipaint";
export * from "./admin";
export * from "./xennote";
export * from "./apiKeys";
export * from "./chat";
export * from "./communities";
export * from "./emoji";
export * from "./presence";
export * from "./gifs";
export * from "./calls";
export * from "./feed";
export * from "./feedback";
