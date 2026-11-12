import type { DetectedElement, ElementType } from "./types.js";
/**
 * Deduplicate detected elements by selector.
 * When two elements share the same selector string, keep the first occurrence.
 */
export declare function dedupBySelector(elements: DetectedElement[]): DetectedElement[];
/**
 * Build a human-readable name from element info.
 */
export declare function suggestName(tagName: string, type: ElementType, text: string, attrs: Record<string, string>): string;
/**
 * Build a stable CSS selector for an element.
 * Prefers data-testid, then id, then a unique path.
 */
export declare function buildSelector(el: {
    tag: string;
    attrs: Record<string, string>;
    indexAmongSiblings: number;
}): {
    selector: string;
    selectorType: "css" | "xpath";
};
