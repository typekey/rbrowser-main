import { ActionTooltip } from "./ActionTooltip";
/*
 * @Author: Zheng Lei
 * @Email: baimoc@163.com
 * @Date: 2026-06-04 12:19:01
 * @LastEditTime: 2026-07-09 14:40:53
 * @FilePath: \baimoc-browser\rbrowser\src\components\ui\ToggleBtn.tsx
 */
import type { ReactNode } from "react";
import { btnBase, btnActive } from "./styles";

export function ToggleBtn({
  active,
  onClick,
  children,
  style,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <ActionTooltip title={title}>
      <button
        style={{
          ...(active ? btnActive : btnBase),
          fontSize: 11,
          ...style,
        }}
        onClick={onClick}
      >
        {children}
      </button>
    </ActionTooltip>
  );
}
