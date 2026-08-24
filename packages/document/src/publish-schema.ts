import { mkdirSync, writeFileSync } from "node:fs";

import {
  designDocumentJsonSchema,
  deterministicSerialize,
} from "./serialization.js";

const schemaDirectory = new URL("../schema/", import.meta.url);
mkdirSync(schemaDirectory, { recursive: true });
writeFileSync(
  new URL("design-document.schema.json", schemaDirectory),
  `${deterministicSerialize(designDocumentJsonSchema, 2)}\n`,
);
