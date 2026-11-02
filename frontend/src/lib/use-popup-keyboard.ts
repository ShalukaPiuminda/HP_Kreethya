'use client';

import { useEffect, useRef, type RefObject } from 'react';

type PopupEntry = { id: symbol; container: RefObject<HTMLElement | null> };

/** Open popups, innermost last. Only the top one reacts to Esc / Tab. */
const popupStack: PopupEntry[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

/** Inputs whose day / month / year (or hour / minute) parts the browser makes separate Tab stops. */
const SEGMENTED_INPUT = 'input[type="date"], input[type="datetime-local"], input[type="time"], input[type="month"], input[type="week"]';

function focusableIn(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
  );
}

/** Prefer the first form field over header buttons such as the close icon. */
function firstField(container: HTMLElement) {
  const elements = focusableIn(container);
  return (
    elements.find((element) => element.matches('input, select, textarea, [aria-haspopup]')) ?? elements[0]
  );
}

/**
 * Keyboard behaviour shared by every popup window:
 * - Esc closes the top-most popup only (a picker opened from a form closes before the form).
 * - Tab / Shift+Tab cycle through the popup's fields and never leave it.
 * - The first field is focused on open, and focus returns to where it was on close.
 */
export function usePopupKeyboard(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;
    const entry: PopupEntry = { id: Symbol('popup'), container: containerRef };
    popupStack.push(entry);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    if (container && !container.contains(document.activeElement)) {
      (firstField(container) ?? container).focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || popupStack[popupStack.length - 1] !== entry) return;
      const root = containerRef.current;
      if (!root) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        const elements = focusableIn(root);
        if (!elements.length) {
          event.preventDefault();
          return;
        }
        const first = elements[0];
        const last = elements[elements.length - 1];
        const active = document.activeElement;
        if (!root.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      popupStack.splice(popupStack.indexOf(entry), 1);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [enabled, containerRef]);
}

/**
 * Makes Tab on a date / time input jump to the next field instead of stepping through its
 * day, month and year parts. Inside a popup it stays within that popup. Mount once at the app root.
 */
export function useFieldTabbing() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement) || !active.matches(SEGMENTED_INPUT)) return;

      const popup = popupStack[popupStack.length - 1]?.container.current ?? null;
      const scope = popup && popup.contains(active) ? popup : document.body;
      const elements = focusableIn(scope);
      const index = elements.indexOf(active);
      if (index < 0) return;

      let next = elements[index + (event.shiftKey ? -1 : 1)];
      if (!next && popup === scope) next = event.shiftKey ? elements[elements.length - 1] : elements[0];
      if (!next) return; // Leaving the page: let the browser move focus to its own UI.

      event.preventDefault();
      next.focus();
    }

    // Capture phase so this runs before the input steps to its next date segment.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
