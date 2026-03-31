// 记录各种 Tag 的 类型

/** workTag */
export type WorkTag =
  | typeof FunctionComponent
  | typeof HostRoot
  | typeof HostComponent
  | typeof HostText
  | typeof Fragment
  | typeof ContextProvider
  | typeof SuspenseComponent
  | typeof OffscreenComponent;

/** 函数式组件 */
export const FunctionComponent = 0;

/** 项目挂载的根节点 */
export const HostRoot = 3;

/** 原生的 DOM 节点，例如 <div> */
export const HostComponent = 5;

/** 文本节点 */
export const HostText = 6;

/** Fragment 类型节点 */
export const Fragment = 7;

/** context provider 节点 */
export const ContextProvider = 8;

/**	Suspense 组件 */
export const SuspenseComponent = 13;
export const OffscreenComponent = 14;
