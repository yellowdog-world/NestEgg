import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export interface WikiDoc {
  slug: string;            // "basics/pension-fund"
  category: string;        // "basics"
  title: string;
  description?: string;
  order?: number;
  filePath: string;
}

const CONTENT_ROOT = path.join(process.cwd(), "content", "wiki");

async function walk(dir: string, base = ""): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const rel = path.join(base, entry.name);
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, rel)));
    } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

export async function listWikiDocs(): Promise<WikiDoc[]> {
  const files = await walk(CONTENT_ROOT);
  const docs = await Promise.all(
    files.map(async (rel) => {
      const filePath = path.join(CONTENT_ROOT, rel);
      const raw = await fs.readFile(filePath, "utf8");
      const { data } = matter(raw);
      const slug = rel.replace(/\.mdx?$/, "").split(path.sep).join("/");
      const category = slug.split("/")[0] ?? "misc";
      return {
        slug,
        category,
        title: (data.title as string) ?? slug,
        description: data.description as string | undefined,
        order: data.order as number | undefined,
        filePath,
      };
    }),
  );
  return docs.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if ((a.order ?? 999) !== (b.order ?? 999)) return (a.order ?? 999) - (b.order ?? 999);
    return a.title.localeCompare(b.title);
  });
}

export async function getWikiDoc(slug: string[]): Promise<WikiDoc | null> {
  const docs = await listWikiDocs();
  const target = slug.join("/");
  return docs.find((d) => d.slug === target) ?? null;
}
