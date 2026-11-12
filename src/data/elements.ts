import type { ElementAction, ElementSource, ElementType } from "@/types";

export const elementTypeLabels: Record<ElementType, string> = {
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

export const actionLabels: Record<ElementAction, string> = {
  click: "点击",
  fill: "填写",
  select: "选择",
  hover: "悬停",
  check: "勾选",
  uncheck: "取消勾选",
  navigate: "导航",
  assert: "断言",
  scroll: "滚动",
  wait: "等待",
};

export const elementSourceLabels: Record<ElementSource, { label: string; color: string; icon: string }> = {
  recorder: { label: "录制生成", color: "bg-accent/15 text-accent border-accent/30", icon: "🎬" },
  "auto-import": { label: "自动识别", color: "bg-purple-500/10 text-purple-400 border-purple-500/30", icon: "🔍" },
  manual: { label: "手动添加", color: "bg-success/10 text-success border-success/30", icon: "✏️" },
};
