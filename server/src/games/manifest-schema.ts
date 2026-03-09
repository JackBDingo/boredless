import { z } from 'zod';

export const ManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id must be lowercase alphanumeric with hyphens'),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  players: z.object({
    min: z.number().int().min(1),
    max: z.number().int().min(1),
  }),
  estimatedMinutes: z.number().positive(),
  icon: z.string(),
  accentColor: z.string(),
  categories: z.array(z.string()).optional(),
  phases: z.record(
    z.object({
      duration: z.number().positive(), // seconds
    }),
  ),
  scoring: z.record(z.number()).optional(),
});

export type GameManifest = z.infer<typeof ManifestSchema>;
