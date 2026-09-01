// `miniature-paints` ships its own types at dist/src/index.d.ts, but its package.json
// "exports" map declares only "require" and "default" conditions - no "types" - so under
// moduleResolution NodeNext TypeScript cannot reach them and the import is implicitly any.
//
// This declares the shape we actually consume. Only scripts/build-paint-catalogue.ts imports
// the package (it is a devDependency); the server reads the generated JSON instead.
declare module "miniature-paints" {
  export interface PaintColor {
    name: string;
    hex: string;
    manufacturer: string;
    /** The commercial range, e.g. "Base", "Warpaints Air", "Model Color". */
    set: string;
    type: "standard" | "metallic" | "ink" | "wash" | "other";
  }

  export const CitadelColour: PaintColor[];
  export const Vallejo: PaintColor[];
  export const ArmyPainter: PaintColor[];
  export const Scale75: PaintColor[];
}
