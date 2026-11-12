import type { DetectedElement, ElementType } from "./types.js";

/**
 * Deduplicate detected elements by selector.
 * When two elements share the same selector string, keep the first occurrence.
 */
export function dedupBySelector(elements: DetectedElement[]): DetectedElement[] {
  const seen = new Set<string>();
  return elements.filter((el) => {
    const key = el.selector.trim();
    if (!key) return false; // drop empty selectors
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Build a human-readable name from element info.
 */
export function suggestName(
  tagName: string,
  type: ElementType,
  text: string,
  attrs: Record<string, string>
): string {
  // Try common attributes first
  const label =
    attrs["aria-label"] ||
    attrs["data-testid"] ||
    attrs["data-name"] ||
    attrs["placeholder"] ||
    attrs["title"] ||
    attrs["alt"] ||
    attrs["name"] ||
    attrs["id"] ||
    "";

  if (label && label.length <= 30) return label;

  // Try inner text
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (cleanText && cleanText.length <= 30) return cleanText;

  // Fallback: type + tag
  const typeLabel: Record<string, string> = {
    button: "按钮",
    input: "输入框",
    text: "文本",
    link: "链接",
    image: "图片",
    select: "下拉选择",
    checkbox: "复选框",
    radio: "单选框",
    container: "容器",
  };

  return `${typeLabel[type] || "元素"} (${tagName})`;
}

/**
 * Build a stable CSS selector for an element.
 * Prefers data-testid, then id, then a unique path.
 */
export function buildSelector(el: {
  tag: string;
  attrs: Record<string, string>;
  indexAmongSiblings: number;
}): { selector: string; selectorType: "css" | "xpath" } {
  const { tag, attrs, indexAmongSiblings } = el;

  // Priority: data-testid
  if (attrs["data-testid"]) {
    return {
      selector: `[data-testid="${escapeAttr(attrs["data-testid"])}"]`,
      selectorType: "css",
    };
  }

  // Priority: id
  if (attrs["id"] && /^[a-zA-Z_][\w\-.:]*$/.test(attrs["id"])) {
    return {
      selector: `#${attrs["id"]}`,
      selectorType: "css",
    };
  }

  // Build a short nth-child path
  const nth = indexAmongSiblings + 1;
  return {
    selector: `${tag}:nth-of-type(${nth})`,
    selectorType: "css",
  };
}

function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
