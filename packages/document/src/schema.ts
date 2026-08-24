import { z } from "zod";

import { designNodeSchema, type DesignNode } from "./nodes.js";
import {
  safeRecordKeySchema,
  tokenDefinitionSchema,
  variableDefinitionSchema,
  type TokenDefinition,
  type VariableDefinition,
} from "./values.js";
import { validateDocumentReferences } from "./validation.js";

export interface Breakpoint {
  name: string;
  minWidth: number;
  maxWidth?: number | undefined;
}

export interface Artboard {
  id: string;
  name: string;
  width: number;
  height: number;
  breakpoint: Breakpoint;
  root: DesignNode;
}

export interface DesignPage {
  id: string;
  name: string;
  artboards: Artboard[];
}

export interface DesignComponent {
  id: string;
  name: string;
  root: DesignNode;
}

export interface DesignDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  tokens: Record<string, TokenDefinition>;
  variables: Record<string, VariableDefinition>;
  components: DesignComponent[];
  pages: DesignPage[];
}

const breakpointSchema = z
  .strictObject({
    name: z.string().min(1),
    minWidth: z.number().finite().nonnegative(),
    maxWidth: z.number().finite().nonnegative().optional(),
  })
  .refine(
    ({ minWidth, maxWidth }) => maxWidth === undefined || maxWidth >= minWidth,
    {
      message: "Breakpoint maxWidth must be greater than or equal to minWidth",
    },
  );

const artboardSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  breakpoint: breakpointSchema,
  root: designNodeSchema,
});

const pageSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  artboards: z.array(artboardSchema),
});

const componentSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1),
  root: designNodeSchema,
});

const safeRecord = <Value extends z.ZodType>(valueSchema: Value) =>
  z.preprocess(
    (value, context) => {
      if (
        value !== null &&
        typeof value === "object" &&
        Object.keys(value).some(
          (key) => !safeRecordKeySchema.safeParse(key).success,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Reserved map key is not allowed",
        });
      }
      return value;
    },
    z.record(safeRecordKeySchema, valueSchema),
  );

export const designDocumentSchema: z.ZodType<DesignDocument> = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    name: z.string().min(1),
    tokens: safeRecord(tokenDefinitionSchema),
    variables: safeRecord(variableDefinitionSchema),
    components: z.array(componentSchema),
    pages: z.array(pageSchema),
  })
  .superRefine(validateDocumentReferences);
