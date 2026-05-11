import fs from "node:fs/promises";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { getWikiDoc, listWikiDocs } from "@/lib/wiki";
import { wikiMdxComponents } from "@/components/wiki/MdxComponents";

export async function generateStaticParams() {
  const docs = await listWikiDocs();
  return docs.map((d) => ({ slug: d.slug.split("/") }));
}

export default async function WikiDocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const doc = await getWikiDoc(slug);
  if (!doc) notFound();

  const raw = await fs.readFile(doc.filePath, "utf8");
  const content = raw.replace(/^---[\s\S]*?---\n?/, ""); // strip frontmatter

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-2" style={{ color: "#171717" }}>
      <Link href="/wiki" className="text-base text-neutral-600 hover:text-neutral-900">
        ← 위키 인덱스
      </Link>
      <header className="mt-2">
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        {doc.description && <p className="mt-1 text-neutral-600">{doc.description}</p>}
      </header>
      <div className="mt-2">
        <MDXRemote
          source={content}
          components={wikiMdxComponents}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkGfm],
              rehypePlugins: [rehypeSlug],
            },
          }}
        />
      </div>
    </article>
  );
}
