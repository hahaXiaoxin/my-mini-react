// 用于记录 Fiber 节点相关操作的 标记

export type Flags = number;

export const NoFlags = 0b0000000;
/** 移动或插入 */
export const Placement = 0b0000001;
/** 属性变化 */
export const Update = 0b0000010;
/** 删除 */
export const ChildDeletion = 0b0000100;

/** commit 阶段需要执行的 flag */
export const MutationMask = Placement | Update | ChildDeletion;
