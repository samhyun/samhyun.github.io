import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum(['spring', 'aws', 'ai', 'workflow', 'testing', 'devops', 'etc']),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    period: z.string(),
    role: z.string(),
    techStack: z.array(z.string()),
    highlights: z.array(z.string()).default([]),
    links: z
      .array(
        z.object({
          label: z.string(),
          url: z.string().url().regex(/^https?:\/\//, 'http(s) 링크만 허용합니다'),
        })
      )
      .default([]),
    type: z.enum(['work', 'personal']).default('work'),
    order: z.number().default(0),
  }),
});

export const collections = { blog, projects };
