import { beginWork } from './begin-work';
import { completeWork } from './complete-work';
import { createWorkInProgress, FiberNode, FiberRootNode } from './fiber';
import { HostRoot } from './work-tags';

/** 全局指针，指向当前工作中的 fiberNode*/
let workInProgress: FiberNode | null = null;

function prepareRefreshStack(root: FiberRootNode) {
  workInProgress = createWorkInProgress(root.current, {});
}

/** 在 Fiber 中进行调度更新 */
export function scheduleUpdateOnFiber(fiber: FiberNode) {
  // TODO 调度功能
  const root = markUpdateFromFiberToRoot(fiber);
  renderRoot(root);
}

/** 从当前节点向根节点标记 */
function markUpdateFromFiberToRoot(fiber: FiberNode) {
  let node = fiber;
  let parent = node.return;

  while (parent !== null) {
    node = parent;
    parent = node.return;
  }

  if (node.tag === HostRoot) {
    return node.stateNode;
  }

  return null;
}

function renderRoot(root: FiberRootNode) {
  // 初始化
  prepareRefreshStack(root);

  do {
    try {
      workLoop();
      break;
    } catch (e) {
      if (__DEV__) {
        console.warn('workLoop 发生错误', e);
      }
      workInProgress = null;
    }
  } while (true);

  const finishedWork = root.current.alternate;
  root.finishedWork = finishedWork;

  // wip fiberNode 树和树中的 flags
  commitRoot(root);
}

function workLoop() {
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

/** 遍历子节点，向下递的过程就是beginWork */
function performUnitOfWork(fiber: FiberNode) {
  const next = beginWork(fiber);
  fiber.memoizdedProps = fiber.pendingProps;

  if (next === null) {
    completeUnitOfWork(fiber);
  } else {
    workInProgress = next;
  }
}

/** 遍历兄弟节点，向上归的过程就是 completeWork */
function completeUnitOfWork(fiber: FiberNode) {
  let node: FiberNode | null = fiber;

  do {
    completeWork(node);

    const sibling = node.sibling;
    if (sibling !== null) {
      workInProgress = sibling;
      return;
    }

    // 没有兄弟节点之后就返回父节点
    node = node.return;
    workInProgress = node;
  } while (node !== null);
}
