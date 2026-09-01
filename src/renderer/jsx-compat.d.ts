// React 19 移除了全局 JSX 命名空间（改为 React.JSX）。
// 项目代码大量使用 JSX.Element 作返回类型，这里做全局兼容映射。
import type { JSX as ReactJSX } from 'react'

declare global {
  namespace JSX {
    type Element = ReactJSX.Element
  }
}

export {}
