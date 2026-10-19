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
 */
export function initDomResilience(): void {
  if (typeof window === 'undefined' || typeof Node === 'undefined') return;

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // The reference node is no longer a child of `this` (e.g. Google Translate wrapped it in <font>).
      // Fallback: append newNode to this parent so React does not crash with a fatal NotFoundError.
      return this.appendChild(newNode);
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child && child.parentNode !== this) {
      // The child was relocated or wrapped by an external DOM mutator.
      // Safely remove from its actual parent if still attached.
      if (child.parentNode) {
        return child.parentNode.removeChild(child);
      }
      return child;
    }
    return originalRemoveChild.call(this, child);
  };
}
