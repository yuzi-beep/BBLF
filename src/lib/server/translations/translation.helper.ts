import "server-only";
import { createHash } from "node:crypto";

import { francAll } from "franc-min";
import type { RootContent } from "mdast";
import { Converter } from "opencc-js/t2cn";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { TranslationInput } from "./translation.type";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);
const toSimplified = Converter({ from: "t", to: "cn" });

export const translationKey = ({ context, targetLocale }: TranslationInput) =>
  `translation:v1:${createHash("sha256").update(context).digest("hex")}:${targetLocale}`;

export const pendingTranslationTag = (key: string) =>
  `translation:pending:${key}`;

function naturalText(node: RootContent): string {
  if (node.type === "text") return node.value;
  return [
    "alt" in node ? node.alt : "",
    "title" in node ? node.title : "",
    "children" in node ? node.children.map(naturalText).join(" ") : "",
  ].join(" ");
}

export function needsNoTranslation({
  context,
  targetLocale,
}: TranslationInput): boolean {
  const text = parser.parse(context).children.map(naturalText).join(" ");
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 80) return false;
  const han = letters.filter((letter) => /\p{Script=Han}/u.test(letter)).length;
  const latin = letters.filter((letter) =>
    /\p{Script=Latin}/u.test(letter),
  ).length;
  // Mixed scripts and ambiguous language scores always go through translation.
  const scores = francAll(text);
  const best = scores.at(0);
  const second = scores.at(1);
  if (!best || best[0] === "und" || (second && best[1] - second[1] < 0.15))
    return false;
  if (targetLocale === "en-US")
    return best[0] === "eng" && latin === letters.length;
  return (
    best[0] === "cmn" && han === letters.length && toSimplified(text) === text
  );
}

function structure(node: RootContent): unknown {
  switch (node.type) {
    case "text":
      return { type: node.type };
    case "code":
      return {
        type: node.type,
        lang: node.lang,
        meta: node.meta,
        value: node.value,
      };
    case "inlineCode":
    case "html":
      return { type: node.type, value: node.value };
    case "link":
    case "image":
      return {
        type: node.type,
        url: node.url,
        children: "children" in node ? node.children.map(structure) : undefined,
      };
    case "definition":
      return { type: node.type, identifier: node.identifier, url: node.url };
    case "linkReference":
    case "imageReference":
      return {
        type: node.type,
        identifier: node.identifier,
        referenceType: node.referenceType,
        children: "children" in node ? node.children.map(structure) : undefined,
      };
    case "heading":
      return {
        type: node.type,
        depth: node.depth,
        children: node.children.map(structure),
      };
    case "list":
      return {
        type: node.type,
        ordered: node.ordered,
        start: node.start,
        children: node.children.map(structure),
      };
    case "listItem":
      return {
        type: node.type,
        checked: node.checked,
        children: node.children.map(structure),
      };
    case "table":
      return {
        type: node.type,
        align: node.align,
        children: node.children.map(structure),
      };
    case "textDirective":
    case "leafDirective":
    case "containerDirective":
      return {
        type: node.type,
        name: node.name,
        attributes: node.attributes,
        children: node.children.map(structure),
      };
    case "footnoteDefinition":
    case "footnoteReference":
      return {
        type: node.type,
        identifier: node.identifier,
        children: "children" in node ? node.children.map(structure) : undefined,
      };
    case "yaml":
      return { type: node.type, value: node.value };
    case "blockquote":
    case "break":
    case "delete":
    case "emphasis":
    case "paragraph":
    case "strong":
    case "tableCell":
    case "tableRow":
    case "thematicBreak":
      return {
        type: node.type,
        children: "children" in node ? node.children.map(structure) : undefined,
      };
  }
}

export function validTranslation(context: string, output: string): boolean {
  if (!output.trim()) return false;
  const original = parser.parse(context);
  const translated = parser.parse(output);
  // This is deliberately conservative: prose may change, executable/structural data may not.
  return (
    JSON.stringify(original.children.map(structure)) ===
    JSON.stringify(translated.children.map(structure))
  );
}
