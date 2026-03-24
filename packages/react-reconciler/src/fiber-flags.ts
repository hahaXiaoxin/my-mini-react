// 用于记录 Fiber 节点相关操作的 标记

export type Flags = number;

export const NoFlags = 0b0000000;
/** 移动或插入 */
export const Placement = 0b0000001;
/** 属性变化 */
export const Update = 0b0000010;
/** 删除 */
export const ChildDeletion = 0b0000100;
/** 表示当前 fiber 存在需要执行相关 effect 的情况 */
export const PassiveEffect = 0b0001000;
export const Ref = 0b0010000;

/** commit 阶段需要执行的 flag */
export const MutationMask = Placement | Update | ChildDeletion | Ref;
export const LayoutMask = Ref;

/** 表示需要执行 effect，删除的时候需要执行卸载回调，所以删除也在 */
export const PassiveMask = PassiveEffect | ChildDeletion;
