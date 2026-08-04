/**
 * The dialog mechanics the faceplate shipped with, factored out so a second
 * dialog does not grow a second implementation. The behaviour is the faceplate's,
 * moved and not rewritten: a scrim that closes on a press landing on itself, a
 * document level listener for Escape and the Tab cycle, and focus moved inside
 * on open. Focus restore stays with the caller, which knows what opened it.
 *
 * Written against the DOM rather than pulled from a package, matching the boot
 * overlay: a dialog that closes three ways and keeps focus inside is a few lines
 * of event handling, and a dependency for it would outweigh the whole feature.
 */

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface DialogShellProps {
  onClose: () => void;
  scrimTestId: string;
  /** Exactly one of the two naming props, per consumer. */
  ariaLabel?: string;
  labelledBy?: string;
  /** Layout of the dialog box; the border and surface are fixed here. */
  dialogClassName?: string;
  /** Focused on open. Falls back to the first focusable, then the dialog. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function DialogShell({
  onClose,
  scrimTestId,
  ariaLabel,
  labelledBy,
  dialogClassName = '',
  initialFocusRef,
  children,
}: DialogShellProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const fallback = dialog?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog;
    (initialFocusRef?.current ?? fallback)?.focus();
  }, [initialFocusRef]);

  /**
   * Escape closes, Tab cycles inside. The listener sits on the document, not on
   * the dialog: clicking a chart moves focus to the body, and a dialog scoped
   * handler would then hear neither key.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid={scrimTestId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-hmi-page/80 p-4"
      // Closing on mousedown, and only when the press landed on the scrim
      // itself, so a drag that starts inside the dialog and ends outside does
      // not dismiss it under the operator's hand.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`border border-hmi-grid bg-hmi-panel ${dialogClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
