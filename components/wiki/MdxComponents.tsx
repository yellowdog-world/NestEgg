import type { MDXComponents } from "mdx/types";
import { SimEmbed } from "./SimEmbed";

function Callout({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "blue" | "amber" | "red" | "green";
}) {
  const cls =
    tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : tone === "red"
        ? "border-red-300 bg-red-50 text-red-900"
        : tone === "green"
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-blue-300 bg-blue-50 text-blue-900";
  return (
    <div className={`my-4 rounded-md border-l-4 px-4 py-3 ${cls}`}>{children}</div>
  );
}

export const wikiMdxComponents: MDXComponents = {
  h1: ({ children }) => (
    <h1 className="mt-8 mb-3 text-3xl font-semibold tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-8 mb-3 text-xl font-semibold tracking-tight">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 text-lg font-semibold tracking-tight">{children}</h3>
  ),
  p: ({ children }) => <p className="my-3 leading-7 text-neutral-900" style={{ color: "#171717" }}>{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc pl-6 leading-7 text-neutral-900">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal pl-6 leading-7 text-neutral-900">{children}</ol>,
  li: ({ children }) => <li className="my-1 text-neutral-900" style={{ color: "#171717" }}>{children}</li>,
  a: ({ children, href }) => (
    <a href={href as string} className="text-blue-700 underline hover:text-blue-900">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-neutral-300 pl-4 text-neutral-600 italic">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    // className이 있으면 pre 안의 코드블록 → 배경 없이 그대로
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-sm text-neutral-800">{children}</code>
    )
  ),
  pre: ({ children }) => (
    // [&>code]: 로 자식 code 요소의 배경을 재설정
    <pre className="my-4 overflow-x-auto rounded-lg bg-neutral-900 p-4 font-mono text-sm text-neutral-100 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-neutral-100">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-neutral-300 bg-neutral-100" style={{ backgroundColor: "#f5f5f5", color: "#171717" }}>{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-neutral-900" style={{ color: "#171717" }}>{children}</th>,
  td: ({ children }) => <td className="border-b border-neutral-200 px-3 py-2 text-neutral-900" style={{ color: "#171717" }}>{children}</td>,
  // Custom components
  Callout,
  SimEmbed,
};
