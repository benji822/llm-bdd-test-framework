import { z } from 'zod';

export const StepTypeEnum = z.enum(['given', 'when', 'then', 'and', 'but']);
export type StepType = z.infer<typeof StepTypeEnum>;

export const StepSchema = z.object({
  type: StepTypeEnum,
  text: z.string().min(1),
  selector: z.string().regex(/^[a-z0-9-]+$/).optional(),
  testData: z.record(z.string(), z.unknown()).optional(),
});
export type NormalizedStep = z.infer<typeof StepSchema>;

export const ScenarioSchema = z.object({
  name: z.string().min(3).max(200),
  tags: z.array(z.string()).optional(),
  steps: z.array(StepSchema).min(1),
  selectors: z.record(z.string(), z.string()),
  testData: z.record(z.string(), z.unknown()).optional(),
});
export type NormalizedScenario = z.infer<typeof ScenarioSchema>;

const AuthorshipSourceEnum = z.enum(['llm', 'manual', 'hybrid']);

export const MetadataSchema = z.object({
  specId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  llmProvider: z.string().min(1),
  llmModel: z.string().min(1),
  clarificationsHash: z.string().optional(),
  authoringMode: z.boolean().optional(),
  authoredBy: AuthorshipSourceEnum.optional(),
});
export type NormalizedMetadata = z.infer<typeof MetadataSchema>;

export const BackgroundSchema = z
  .object({
    steps: z.array(StepSchema).min(1),
  })
  .optional();
export type NormalizedBackground = z.infer<typeof BackgroundSchema>;

export const NormalizedYamlSchema = z.object({
  feature: z.string().min(3).max(200),
  description: z.string().optional(),
  background: BackgroundSchema,
  scenarios: z.array(ScenarioSchema).min(1),
  metadata: MetadataSchema,
});

export type NormalizedYaml = z.infer<typeof NormalizedYamlSchema>;
