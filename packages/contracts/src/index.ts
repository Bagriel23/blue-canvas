import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(320);

export const passwordSchema = z.string().min(12).max(1024);
export const displayNameSchema = z.string().trim().min(1).max(100);
export const localeSchema = z.enum(["en-US", "pt-BR", "ko-KR"]);
export const projectRoleSchema = z.enum([
  "owner",
  "editor",
  "commenter",
  "viewer",
]);
export const personalAccessTokenScopeSchema = z.enum([
  "projects:read",
  "projects:write",
  "assets:read",
  "assets:write",
  "admin",
]);

export const bootstrapAdminRequestSchema = z.strictObject({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  locale: localeSchema.default("en-US"),
  setupSecret: z.string().min(1).max(1024),
});

export const createInvitationRequestSchema = z.strictObject({
  email: emailSchema,
  expiresInHours: z.number().int().min(1).max(168).default(48),
});

export const inviteProjectMemberRequestSchema = z.strictObject({
  email: emailSchema,
  role: projectRoleSchema.exclude(["owner"]),
  expiresInHours: z.number().int().min(1).max(168).default(48),
});

export const acceptInvitationRequestSchema = z.strictObject({
  token: z.string().min(32).max(512),
  displayName: displayNameSchema,
  password: passwordSchema,
  locale: localeSchema.default("en-US"),
});

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});

export const createProjectRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
});

export const createNamedVersionRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
});

export const restoreNamedVersionRequestSchema = createNamedVersionRequestSchema;

const normalizedPositionSchema = z.strictObject({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

const mentionUserIdsSchema = z
  .array(z.uuid())
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Mentioned users must be unique",
  });

export const createCommentRequestSchema = z.strictObject({
  body: z.string().trim().min(1).max(5000),
  nodeId: z.uuid().optional(),
  position: normalizedPositionSchema.optional(),
  mentionUserIds: mentionUserIdsSchema.default([]),
});

export const updateCommentRequestSchema = z
  .strictObject({
    body: z.string().trim().min(1).max(5000).optional(),
    mentionUserIds: mentionUserIdsSchema.optional(),
  })
  .refine(
    (input) => input.body !== undefined || input.mentionUserIds !== undefined,
    { message: "At least one comment field is required" },
  );

export const resolveCommentRequestSchema = z.strictObject({
  resolved: z.boolean(),
});

export const updateProjectRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => input.name !== undefined || input.archived !== undefined, {
    message: "At least one project field is required",
  });

export const addProjectMemberRequestSchema = z.strictObject({
  email: emailSchema,
  role: projectRoleSchema.exclude(["owner"]),
});

export const updateProjectMemberRequestSchema = z.strictObject({
  role: projectRoleSchema.exclude(["owner"]),
});

export const createPersonalAccessTokenRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(personalAccessTokenScopeSchema).min(1).max(10),
  expiresAt: z.iso.datetime().optional(),
});

export const libraryEntityKindSchema = z.enum(["kit", "template"]);

export const libraryStatusSchema = z.enum(["draft", "published", "deprecated"]);

export const createLibraryDraftRequestSchema = z.strictObject({
  manifest: z.unknown(),
});

export type CreateLibraryDraftRequest = z.infer<
  typeof createLibraryDraftRequestSchema
>;
export type LibraryEntityKind = z.infer<typeof libraryEntityKindSchema>;
export type LibraryStatus = z.infer<typeof libraryStatusSchema>;

export const errorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
    traceId: z.string().min(1),
  }),
});

export type BootstrapAdminRequest = z.infer<typeof bootstrapAdminRequestSchema>;
export type CreateInvitationRequest = z.infer<
  typeof createInvitationRequestSchema
>;
export type InviteProjectMemberRequest = z.infer<
  typeof inviteProjectMemberRequestSchema
>;
export type AcceptInvitationRequest = z.infer<
  typeof acceptInvitationRequestSchema
>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type CreateNamedVersionRequest = z.infer<
  typeof createNamedVersionRequestSchema
>;
export type RestoreNamedVersionRequest = z.infer<
  typeof restoreNamedVersionRequestSchema
>;
export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;
export type UpdateCommentRequest = z.infer<typeof updateCommentRequestSchema>;
export type ResolveCommentRequest = z.infer<typeof resolveCommentRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type AddProjectMemberRequest = z.infer<
  typeof addProjectMemberRequestSchema
>;
export type UpdateProjectMemberRequest = z.infer<
  typeof updateProjectMemberRequestSchema
>;
export type CreatePersonalAccessTokenRequest = z.infer<
  typeof createPersonalAccessTokenRequestSchema
>;
export type ProjectRole = z.infer<typeof projectRoleSchema>;
export type PersonalAccessTokenScope = z.infer<
  typeof personalAccessTokenScopeSchema
>;
