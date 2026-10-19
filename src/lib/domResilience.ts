/**
 * DOM Resilience Layer
 *
 * Prevents fatal React crashes caused by Google Translate, browser auto-translation,
 * and extensions modifying DOM nodes.
 *
 * Specifically addresses:
 * "NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before which
 *  the new node is to be inserted is not a child of this node."
 * and
 * "NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed
 *  is not a child of this node."
 * and
 * "NotFoundError: Failed to execute 'replaceChild' on 'Node': The node to be replaced
 *  is not a child of this node."
 */

export function isDomMutationError(err: any): boolean {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : err.message || err.name || String(err)).toLowerCase();
  return (
    msg.includes('not a child of this node') ||
    msg.includes("failed to execute 'insertbefore'") ||
    msg.includes("failed to execute 'removechild'") ||
    msg.includes("failed to execute 'replacechild'") ||
    (msg.includes('notfounderror') &&
      (msg.includes('insertbefore') || msg.includes('removechild') || msg.includes('replacechild')))
  );
}

export function initDomResilience(): void {
  if (typeof window === 'undefined' || typeof Node === 'undefined') return;

  // 1. Bulletproof insertBefore
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    // If referenceNode has been wrapped or detached by Google Translate / extension
    if (referenceNode && referenceNode.parentNode !== this) {
      if (referenceNode.parentNode) {
        try {
          return referenceNode.parentNode.insertBefore(newNode, referenceNode);
        } catch {
          // fallback to appendChild
        }
      }
      try {
        return this.appendChild(newNode);
      } catch {
        return newNode;
      }
    }

    try {
      return originalInsertBefore.call(this, newNode, referenceNode);
    } catch (err: any) {
      if (isDomMutationError(err)) {
        try {
          return this.appendChild(newNode);
        } catch {
          return newNode;
        }
      }
      throw err;
    }
  };

  // 2. Bulletproof removeChild
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child && child.parentNode !== this) {
      if (child.parentNode) {
        try {
          return child.parentNode.removeChild(child);
        } catch {
          return child;
        }
      }
      return child;
    }

    try {
      return originalRemoveChild.call(this, child);
    } catch (err: any) {
      if (isDomMutationError(err)) {
        return child;
      }
      throw err;
    }
  };

  // 3. Bulletproof replaceChild
  const originalReplaceChild = Node.prototype.replaceChild;
  Node.prototype.replaceChild = function <T extends Node>(newChild: Node, oldChild: T): T {
    if (oldChild && oldChild.parentNode !== this) {
      if (oldChild.parentNode) {
        try {
          return oldChild.parentNode.replaceChild(newChild, oldChild) as T;
        } catch {
          // fallback to appendChild
        }
      }
      try {
        this.appendChild(newChild);
      } catch {}
      return oldChild;
    }

    try {
      return originalReplaceChild.call(this, newChild, oldChild);
    } catch (err: any) {
      if (isDomMutationError(err)) {
        try {
          this.appendChild(newChild);
        } catch {}
        return oldChild;
      }
      throw err;
    }
  };
}
