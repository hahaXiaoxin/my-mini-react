import { appendChildToContainer, commitUpdate, Container, insertChildToContainer, Instance, removeChild } from 'host-config';
import { FiberNode, FiberRootNode, PendingPassiveEffect } from './fiber';
import { Placement, MutationMask, NoFlags, Update, ChildDeletion, PassiveEffect, Flags, PassiveMask } from './fiber-flags';
import { FunctionComponent, HostComponent, HostRoot, HostText } from './work-tags';
import { Effect, FCUpdateQueue } from './fiber-hooks';
import { HookHasEffect } from './hook-effect-tags';

let nextEffect: FiberNode | null = null;

export function commitMutationEffects(finishedWork: FiberNode, root: FiberRootNode) {
  nextEffect = finishedWork;

  while (nextEffect !== null) {
    // 向下遍历
    const child: FiberNode | null = nextEffect.child;

    if ((nextEffect.subtreeFlags & (MutationMask | PassiveMask)) !== NoFlags && child !== null) {
      child.return = nextEffect;
      nextEffect = child;
    } else {
      // 向上遍历
      up: while (nextEffect !== null) {
        commitMutationEffectsOnFiber(nextEffect, root);
        const sibling: FiberNode | null = nextEffect.sibling;

        if (sibling !== null) {
          sibling.return = nextEffect.return;
          nextEffect = sibling;
          break up;
        }

        nextEffect = nextEffect.return;
      }
    }
  }
}

function commitMutationEffectsOnFiber(finishedWork: FiberNode, root: FiberRootNode) {
  const flags = finishedWork.flags;

  // flags Placement
  if ((flags & Placement) !== NoFlags) {
    commitPlacement(finishedWork);
    finishedWork.flags &= ~Placement;
  }

  // flags Update
  if ((flags & Update) !== NoFlags) {
    commitUpdate(finishedWork);
    finishedWork.flags &= ~Update;
  }

  // flags ChildDeletion
  if ((flags & ChildDeletion) !== NoFlags) {
    const deletions = finishedWork.deletions;

    if (deletions !== null) {
      deletions.forEach((child) => {
        commitDeletion(child, root);
      });
    }

    finishedWork.flags &= ~ChildDeletion;
  }

  // flags PassiveEffect
  if ((flags & PassiveEffect) !== NoFlags) {
    // 收集回调
    commitPassiveEffect(finishedWork, root, 'update');
    finishedWork.flags &= ~PassiveEffect;
  }
}

function commitPassiveEffect(fiber: FiberNode, root: FiberRootNode, type: keyof PendingPassiveEffect) {
  // update 和 unmount
  if (fiber.tag !== FunctionComponent || (type === 'update' && (fiber.flags & PassiveEffect) !== PassiveEffect)) {
    return;
  }

  const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;

  if (updateQueue !== null) {
    if (updateQueue.lastEffect === null && __DEV__) {
      console.error('当 FC 存在 PassiveEffect flag时，不应该不存在 lastEffect');
      return;
    }

    root.pendingPassiveEffect[type].push(updateQueue.lastEffect!);
  }
}

function commitHookEffectList(flags: Flags, lastEffect: Effect, callback: (effect: Effect) => void) {
  let effect = lastEffect.next as Effect;
  do {
    if ((effect.tag & flags) === flags) {
      callback(effect);
    }
    effect = effect.next as Effect;
  } while (effect !== lastEffect.next);
}

/** 出发 destroy effect并且不再触发 create effect 用于组件卸载时*/
export function commitHookEffectListUnmount(flags: Flags, lastEffect: Effect) {
  commitHookEffectList(flags, lastEffect, (effect) => {
    const destroy = effect.destroy;
    if (typeof destroy === 'function') {
      destroy();
    }

    effect.tag &= ~HookHasEffect;
  });
}

/** 需要触发 destroy effect，但是节点没有卸载的情况 */
export function commitHookEffectListDestroy(flags: Flags, lastEffect: Effect) {
  commitHookEffectList(flags, lastEffect, (effect) => {
    const destroy = effect.destroy;
    if (typeof destroy === 'function') {
      destroy();
    }
  });
}

/** 执行 create effect 时，同时要注意给 destroy 赋值 */
export function commitHookEffectListCreate(flags: Flags, lastEffect: Effect) {
  commitHookEffectList(flags, lastEffect, (effect) => {
    const create = effect.create;
    if (typeof create === 'function') {
      effect.destroy = create();
    }
  });
}

/**
 * 收集需要从 DOM 中删除的顶层 Host 节点
 *
 * 当删除 Fragment 或函数组件时，它们本身没有对应的 DOM 节点，
 * 真正需要删除的是它们的子 Host 节点。此函数用于收集这些顶层 Host 节点。
 *
 * @example
 * 删除以下 Fragment 时：
 * ```jsx
 * <>
 *   <div>              // 顶层 Host 1 ✅ 需要删除
 *     <span>child</span>  // 嵌套的 Host ❌ 不需要单独删除，删父节点时会一起删
 *   </div>
 *   <p>text</p>        // 顶层 Host 2 ✅ 需要删除（是 div 的兄弟节点）
 * </>
 * ```
 *
 * commitNestedComponent 会深度优先遍历整个子树，遇到每个 Host 节点都会调用此函数：
 * 1. 遇到 <div> → 数组为空，直接 push
 * 2. 遇到 <span> → 检查是否是 <div> 的兄弟？不是（是子节点），不添加
 * 3. 遇到 <p> → 检查是否是 <div> 的兄弟？是，添加
 *
 * 最终 childrenToDelete = [div, p]，然后分别删除这两个 DOM 节点
 *
 * @param childrenToDelete - 收集需要删除的顶层 Host 节点数组
 * @param unmountFiber - 当前遍历到的需要卸载的 fiber 节点
 */
function recordHostChildrenToDelete(childrenToDelete: FiberNode[], unmountFiber: FiberNode) {
  const lastOne = childrenToDelete[childrenToDelete.length - 1];

  if (!lastOne) {
    // 数组为空，说明这是第一个 host 节点，直接添加
    childrenToDelete.push(unmountFiber);
  } else {
    // 数组不为空，需要检查当前节点是否是上一个节点的兄弟节点
    // 只有兄弟节点才是同一层级的顶层 Host，需要单独删除
    // 如果是子节点，删除父节点时会一并删除，无需单独处理
    let node = lastOne.sibling;

    while (node !== null) {
      if (unmountFiber === node) {
        childrenToDelete.push(node);
      }
      node = node.sibling;
    }
  }
}

/** commit 删除操作 */
function commitDeletion(childToDelete: FiberNode, root: FiberRootNode) {
  // 收集需要删除的节点
  const rootChildrenToDelete: FiberNode[] = [];

  // 递归子树
  commitNestedComponent(childToDelete, (unmountFiber) => {
    switch (unmountFiber.tag) {
      case HostComponent:
        recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
        // TODO 解绑 ref
        return;
      case HostText:
        recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);

        return;
      case FunctionComponent:
        // TODO useEffect unmount
        commitPassiveEffect(unmountFiber, root, 'unmount');
        return;
      default:
        if (__DEV__) {
          console.warn('未处理的 unmount 类型', unmountFiber);
        }
        break;
    }
  });

  // 移除 rootHostComponent 的 DOM
  if (rootChildrenToDelete.length) {
    const hostParent = getHostParent(childToDelete);
    if (hostParent !== null) {
      rootChildrenToDelete.forEach((node) => {
        removeChild(node.stateNode, hostParent);
      });
    }
  }

  childToDelete.return = null;
  childToDelete.child = null;
}

/**
 * commit 删除操作
 */
function commitNestedComponent(root: FiberNode, onCommitUnmount: (fiber: FiberNode) => void) {
  // 递归子树
  let node = root;

  while (true) {
    onCommitUnmount(node);

    if (node.child !== null) {
      node.child.return = node;
      node = node.child;
      continue;
    }

    if (node === root) {
      return;
    }

    while (node.sibling === null) {
      if (node.return === null || node.return === root) {
        return;
      }

      node = node.return;
    }

    // 向上一层之后要立马切换到对应的 sibling，防止重复处理
    node.sibling.return = node.return;
    node = node.sibling;
  }
}

/** commit 插入等操作 */
function commitPlacement(finishedWork: FiberNode) {
  if (__DEV__) {
    console.warn('执行 commitPlacement', finishedWork, 'tag:', finishedWork.tag);
  }

  // parent DOM
  const hostParent = getHostParent(finishedWork);

  // host sibling
  const sibling = getHostSibling(finishedWork);

  if (__DEV__) {
    console.warn('找到 hostParent:', hostParent);
  }

  if (hostParent !== null) {
    // sibling 可能为 null，这样就直接执行append 就好了
    insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
  }
}

/** 用于查找当前 fiber 的兄弟 host 节点（在浏览器中是 dom） */
function getHostSibling(fiber: FiberNode) {
  let node: FiberNode = fiber;

  findSibling: while (true) {
    while (node.sibling === null) {
      const parent = node.return;

      if (parent === null || parent.tag === HostComponent || parent.tag === HostRoot) {
        return null;
      }

      node = parent;
    }

    node.sibling.return = node.return;
    node = node.sibling;

    while (node.tag !== HostText && node.tag !== HostComponent) {
      // 向下遍历
      if ((node.flags & Placement) !== NoFlags) {
        continue findSibling;
      }

      if (node.child === null) {
        continue findSibling;
      } else {
        node.child.return = node;
        node = node.child;
      }
    }

    if ((node.flags & Placement) === NoFlags) {
      return node.stateNode;
    }
  }
}

function getHostParent(fiber: FiberNode): Container | null {
  let parent = fiber.return;

  while (parent) {
    const parentTag = parent.tag;

    if (parentTag === HostComponent) {
      return parent.stateNode;
    }

    if (parentTag === HostRoot) {
      return parent.stateNode.container;
    }

    parent = parent.return;
  }

  if (__DEV__) {
    console.warn('未找到host parent');
  }

  return null;
}

/**
 * 将 Fiber 节点对应的 DOM 节点插入到 hostParent 中
 * 真实 DOM 修改
 */
function insertOrAppendPlacementNodeIntoContainer(finishedWork: FiberNode, hostParent: Container | null, before?: Instance) {
  // fiber host 不可能是 hostRoot
  if (hostParent === null) {
    return;
  }

  const { tag } = finishedWork;

  if (tag === HostComponent || tag === HostText) {
    if (__DEV__) {
      console.warn('appendPlacementNodeIntoContainer: 插入 DOM', finishedWork.stateNode, '到', hostParent);
    }
    if (before) {
      insertChildToContainer(finishedWork.stateNode, hostParent, before);
      return;
    }
    appendChildToContainer(hostParent, finishedWork.stateNode);
    return;
  }

  const child = finishedWork.child;
  if (child !== null) {
    insertOrAppendPlacementNodeIntoContainer(child, hostParent);
    let sibling = child.sibling;

    while (sibling !== null) {
      insertOrAppendPlacementNodeIntoContainer(sibling, hostParent);
      sibling = sibling.sibling;
    }
  }
}
