import {
  appendChildToContainer,
  commitUpdate,
  Container,
  hideInstance,
  hideTextInstance,
  insertChildToContainer,
  Instance,
  removeChild,
  unhideInstance,
  unhideTextInstance
} from 'host-config';
import { FiberNode, FiberRootNode, PendingPassiveEffect } from './fiber';
import {
  Placement,
  MutationMask,
  NoFlags,
  Update,
  ChildDeletion,
  PassiveEffect,
  Flags,
  Ref,
  LayoutMask,
  Visibility
} from './fiber-flags';
import { FunctionComponent, HostComponent, HostRoot, HostText, OffscreenComponent } from './work-tags';
import { Effect, FCUpdateQueue } from './fiber-hooks';
import { HookHasEffect } from './hook-effect-tags';

let nextEffect: FiberNode | null = null;

export function commitEffects(
  phrase: 'mutation' | 'layout',
  mask: Flags,
  callback: (fiber: FiberNode, fiberRootNode: FiberRootNode) => void
) {
  return (finishedWork: FiberNode, root: FiberRootNode) => {
    nextEffect = finishedWork;

    while (nextEffect !== null) {
      // 向下遍历
      const child: FiberNode | null = nextEffect.child;

      if ((nextEffect.subtreeFlags & mask) !== NoFlags && child !== null) {
        child.return = nextEffect;
        nextEffect = child;
      } else {
        // 向上遍历
        up: while (nextEffect !== null) {
          callback(nextEffect, root);
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
  };
}

function commitMutationEffectsOnFiber(finishedWork: FiberNode, root: FiberRootNode) {
  const { flags, tag } = finishedWork;

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

  if ((flags & Ref) !== NoFlags && tag === HostComponent) {
    safelyDetachRef(finishedWork);
  }

  if ((flags & Visibility) !== NoFlags && tag === OffscreenComponent) {
    const isHidden = finishedWork.pendingProps.mode === 'hidden';
    hideOrUnhideAllChildren(finishedWork, isHidden);
    finishedWork.flags &= ~Visibility;
  }
}

function hideOrUnhideAllChildren(finishedWork: FiberNode, isHidden: boolean) {
  findHostSubtreeRoot(finishedWork, (hostSubtreeRoot) => {
    const instance = hostSubtreeRoot.stateNode;

    if (hostSubtreeRoot.tag === HostComponent) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      isHidden ? hideInstance(instance) : unhideInstance(instance);
    } else if (hostSubtreeRoot.tag === HostText) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      isHidden ? hideTextInstance(instance) : unhideTextInstance(instance, hostSubtreeRoot.memoizedProps.context);
    }
  });
}

function findHostSubtreeRoot(finishedWork: FiberNode, callback: (hostSubtreeRoot: FiberNode) => void) {
  let node = finishedWork;
  let hostSubtreeRoot = null;

  while (true) {
    if (node.tag === HostComponent) {
      if (hostSubtreeRoot === null) {
        hostSubtreeRoot = node;
        callback(hostSubtreeRoot);
      }
    } else if (node.tag === HostText) {
      if (hostSubtreeRoot === null) {
        callback(node);
      }
    } else if (node.tag === OffscreenComponent && node.pendingProps.mode === 'hidden' && node !== finishedWork) {
      // 嵌套 Suspense 的话无需处理
    } else if (node.child !== null) {
      node.child.return = node;
      node = node.child;
      continue;
    }

    if (node === finishedWork) {
      return;
    }

    while (node.sibling === null) {
      if (node.return === null || node.return === finishedWork) {
        return;
      }

      if (hostSubtreeRoot === node) {
        hostSubtreeRoot = null;
      }

      node = node.return;
    }

    if (hostSubtreeRoot === node) {
      hostSubtreeRoot = null;
    }

    node.sibling.return = node.return;
    node = node.sibling;
  }
}

function safelyDetachRef(current: FiberNode) {
  const ref = current.ref;
  if (ref !== null) {
    if (typeof ref === 'function') {
      ref(null);
    } else {
      ref.current = null;
    }
  }
}

function commitLayoutEffectsOnFiber(finishedWork: FiberNode, root: FiberRootNode) {
  const { flags, tag } = finishedWork;

  // flags Ref
  if ((flags & Ref) !== NoFlags && tag === HostComponent) {
    safelyAttachRef(finishedWork);
    finishedWork.flags &= ~Ref;
  }
}

function safelyAttachRef(fiber: FiberNode) {
  const ref = fiber.ref;

  if (ref !== null) {
    const instance = fiber.stateNode;
    if (typeof ref === 'function') {
      ref(instance);
    } else {
      ref.current = instance;
    }
  }
}

export const commitMutationEffects = commitEffects('mutation', MutationMask | PassiveEffect, commitMutationEffectsOnFiber);

export const commitLayoutEffects = commitEffects('layout', LayoutMask, commitLayoutEffectsOnFiber);

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

/** commit 删除操作 */
function commitDeletion(childToDelete: FiberNode, root: FiberRootNode) {
  // 收集需要删除的节点
  const rootChildrenToDelete: FiberNode[] = [];
  // 当前所在的 host 子树根：进入时设置，离开时清空
  // 用于判断当前 host 节点是不是顶层（不在已设置的 hostSubtreeRoot 子树内的 host 才是新顶层）
  let hostSubtreeRoot: FiberNode | null = null;

  // 递归子树
  commitNestedComponent(
    childToDelete,
    (unmountFiber) => {
      switch (unmountFiber.tag) {
        case HostComponent:
          if (hostSubtreeRoot === null) {
            // 不在任何 host 子树内 → 这是新的顶层 host
            hostSubtreeRoot = unmountFiber;
            rootChildrenToDelete.push(unmountFiber);
          }
          // 解绑 ref（无论是否顶层）
          safelyDetachRef(unmountFiber);
          return;
        case HostText:
          if (hostSubtreeRoot === null) {
            hostSubtreeRoot = unmountFiber;
            rootChildrenToDelete.push(unmountFiber);
          }
          return;
        case FunctionComponent:
          // useEffect unmount
          commitPassiveEffect(unmountFiber, root, 'unmount');
          return;
        default:
          if (__DEV__) {
            console.warn('未处理的 unmount 类型', unmountFiber);
          }
          break;
      }
    },
    (leaveFiber) => {
      // 向上回溯离开一个 fiber 时：如果离开的就是当前 hostSubtreeRoot，清空标记
      if (leaveFiber === hostSubtreeRoot) {
        hostSubtreeRoot = null;
      }
    }
  );

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
 * 深度优先遍历子树
 *
 * @param root - 子树根节点
 * @param onEnter - 进入节点时的回调（首次访问该节点）
 * @param onLeave - 离开节点时的回调（该节点的整棵子树已遍历完毕）
 */
function commitNestedComponent(root: FiberNode, onEnter: (fiber: FiberNode) => void, onLeave?: (fiber: FiberNode) => void) {
  let node = root;

  while (true) {
    onEnter(node);

    if (node.child !== null) {
      node.child.return = node;
      node = node.child;
      continue;
    }

    // 走到这里说明 node 是叶子或子树已遍历完
    // 注意：到达叶子时，onLeave(叶子) 等价于"离开叶子"
    onLeave?.(node);

    if (node === root) {
      return;
    }

    while (node.sibling === null) {
      if (node.return === null || node.return === root) {
        // 即将退出整棵子树前，如果 root 自身也需要 leave 通知，可以在这里补
        // 不过本场景下根节点的 onLeave 已经在循环顶部处理过了，无需重复
        return;
      }

      node = node.return;
      // 上爬到一个父节点，意味着该父节点的整棵子树已遍历完
      onLeave?.(node);
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
    insertOrAppendPlacementNodeIntoContainer(child, hostParent, before);
    let sibling = child.sibling;

    while (sibling !== null) {
      insertOrAppendPlacementNodeIntoContainer(sibling, hostParent, before);
      sibling = sibling.sibling;
    }
  }
}
