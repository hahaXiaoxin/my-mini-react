import { appendInitialChild, Container, createInstance, createTextInstance, Instance } from 'host-config';
import { FiberNode } from './fiber';
import { ContextProvider, Fragment, FunctionComponent, HostComponent, HostRoot, HostText, OffscreenComponent, SuspenseComponent } from './work-tags';
import { NoFlags, Ref, Update, Visibility } from './fiber-flags';
import { popProvider } from './fiber-context';
import { ReactProviderType } from 'shared/react-types';
import { popSuspenseHandler } from './suspense-context';

/** 标记表明需要更新 */
function markUpdate(fiber: FiberNode) {
  fiber.flags |= Update;
}

// 递归中的“归”
export const completeWork = (wip: FiberNode) => {
  const newProps = wip.pendingProps;
  const current = wip.alternate;

  switch (wip.tag) {
    case HostComponent:
      // 1. 构建 DOM
      if (current !== null && wip.stateNode) {
        // TODO update
        // update
        // props 是否发生变化
        // className style
        markUpdate(wip);
        // 标记 ref
        if (current.ref !== wip.ref) markRef(wip);
      } else {
        // 1. 构建 DOM
        const instance = createInstance(wip.type, newProps);
        // 2. 将 DOM 插入 DOM 树中
        appendAllChildren(instance, wip);
        wip.stateNode = instance;
        // 3. 标记 ref
        if (wip.ref !== null) markRef(wip);
      }

      bubbleProperties(wip);
      break;
    case HostText:
      // 1. 构建 DOM
      if (current !== null && wip.stateNode) {
        // update
        const oldText = current.memoizdedProps?.content;
        const newText = newProps.content;

        if (oldText !== newText) {
          markUpdate(wip);
        }
      } else {
        // 1. 构建 DOM
        const instance = createTextInstance(newProps.content);
        wip.stateNode = instance;
      }

      bubbleProperties(wip);
      return null;
    case HostRoot:
    case FunctionComponent:
    case Fragment:
    case OffscreenComponent:
      bubbleProperties(wip);
      return null;
    case ContextProvider: {
      const context = (wip.type as ReactProviderType<any>)._context;
      popProvider(context);
      bubbleProperties(wip);
      return null;
    }
    case SuspenseComponent: {
      popSuspenseHandler();
      const offscreenFiber = wip.child as FiberNode;
      const isHidden = offscreenFiber.pendingProps.mode === 'hidden';
      const currentOffscreenFiber = offscreenFiber.alternate;

      if (currentOffscreenFiber !== null) {
        // update
        const wasHidden = currentOffscreenFiber.pendingProps.mode === 'hidden';
        if (isHidden !== wasHidden) {
          offscreenFiber.flags |= Visibility;
          bubbleProperties(offscreenFiber);
        }
      } else if (isHidden) {
        offscreenFiber.flags |= Visibility;
        bubbleProperties(offscreenFiber);
      }
      bubbleProperties(wip);
      return null;
    }
    default:
      if (__DEV__) {
        console.warn('未处理的 completeWork 情况', wip);
      }
      break;
  }
};

function markRef(fiber: FiberNode) {
  fiber.flags |= Ref;
}

/** 将对应的 DOM 树拼装出来 */
function appendAllChildren(parent: Container | Instance, wip: FiberNode) {
  let node = wip.child;

  while (node !== null) {
    // 只处理 HostComponent 和 HostText，
    if (node.tag === HostComponent || node.tag === HostText) {
      appendInitialChild(parent, node.stateNode);
    } else if (node.child !== null) {
      // 如果不是 Host 节点（如 FunctionComponent），向下找它的子节点
      node.child.return = node;
      node = node.child;
      continue;
    }

    if (node === wip) {
      return;
    }

    // 没有 sibling，向上回溯
    while (node.sibling === null) {
      if (node.return === null || node.return === wip) {
        return;
      }
      node = node.return;
    }

    node.sibling.return = node.return;
    node = node.sibling;
  }
}

/**
 * 将子节点的 flags 合并到父节点的 subtreeFlags 中
 */
function bubbleProperties(wip: FiberNode) {
  let subtreeFlags = NoFlags;
  let child = wip.child;

  // 这样某个节点的 subtreeFlags 就包含了所有后代节点的 flags
  while (child !== null) {
    subtreeFlags |= child.subtreeFlags;
    subtreeFlags |= child.flags;
    child.return = wip;
    child = child.sibling;
  }

  wip.subtreeFlags |= subtreeFlags;
}
