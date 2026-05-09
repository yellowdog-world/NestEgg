import type { z } from "zod";

export interface Simulator<I, O> {
  /** kebab-case URL/slug. e.g. "pension-tax" */
  name: string;
  /** Human-readable title shown in catalog and page header */
  title: string;
  /** One-liner shown in catalog */
  description: string;
  /** Group for catalog sectioning. e.g. "세금", "포트폴리오" */
  group: string;
  /** Input validation */
  schema: z.ZodSchema<I>;
  /** Pure function, no side effects */
  compute: (input: I) => O;
  /** Initial form values */
  defaultInput: I;
}

export interface SimulatorMeta {
  path: string;
  title: string;
  group: string;
  description: string;
}
