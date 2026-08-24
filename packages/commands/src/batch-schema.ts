import {
  designNodeSchema,
  gridLayoutSchema,
  imageSourceSchema,
  interactionSchema,
  nodeStyleSchema,
  stackLayoutSchema,
  tokenDefinitionSchema,
  variableDefinitionSchema,
} from "@blue-canvas/document";
import { z } from "zod";

const addNodeCommandSchema = z.strictObject({
  type: z.literal("add-node"),
  parentId: z.uuid(),
  node: designNodeSchema,
  index: z.number().int().nonnegative().optional(),
  slot: z.enum(["children", "whenTrue", "whenFalse"]).optional(),
});

const updateNodeCommandSchema = z.strictObject({
  type: z.literal("update-node"),
  nodeId: z.uuid(),
  patch: z
    .strictObject({
      name: z.string().min(1).optional(),
      visible: z.boolean().optional(),
      style: nodeStyleSchema.optional(),
      interactions: z.array(interactionSchema).optional(),
      layout: z.union([stackLayoutSchema, gridLayoutSchema]).optional(),
      text: z.string().optional(),
      source: imageSourceSchema.optional(),
      alt: z.string().optional(),
      icon: z.string().min(1).optional(),
      label: z.string().optional(),
      href: z.string().min(1).optional(),
      buttonType: z.enum(["button", "submit", "reset"]).optional(),
      inputType: z
        .enum(["text", "email", "password", "number", "search"])
        .optional(),
      variable: z.string().min(1).optional(),
      placeholder: z.string().optional(),
      collection: z.string().min(1).optional(),
      equals: z
        .union([z.string(), z.number(), z.boolean(), z.null()])
        .optional(),
      componentId: z.uuid().optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, "Patch cannot be empty"),
});

const removeNodeCommandSchema = z.strictObject({
  type: z.literal("remove-node"),
  nodeId: z.uuid(),
});

const moveNodeCommandSchema = z.strictObject({
  type: z.literal("move-node"),
  nodeId: z.uuid(),
  parentId: z.uuid(),
  index: z.number().int().nonnegative().optional(),
  slot: z.enum(["children", "whenTrue", "whenFalse"]).optional(),
});

const setTokenCommandSchema = z.strictObject({
  type: z.literal("set-token"),
  name: z.string().min(1),
  value: tokenDefinitionSchema,
});

const setVariableCommandSchema = z.strictObject({
  type: z.literal("set-variable"),
  name: z.string().min(1),
  value: variableDefinitionSchema,
});

const renamePageCommandSchema = z.strictObject({
  type: z.literal("rename-page"),
  pageId: z.uuid(),
  name: z.string().min(1),
});

export const designCommandBatchSchema = z.strictObject({
  id: z.uuid(),
  actorId: z.uuid(),
  baseRevision: z.number().int().nonnegative(),
  commands: z.array(
    z.discriminatedUnion("type", [
      addNodeCommandSchema,
      updateNodeCommandSchema,
      removeNodeCommandSchema,
      moveNodeCommandSchema,
      setTokenCommandSchema,
      setVariableCommandSchema,
      renamePageCommandSchema,
    ]),
  ),
});
