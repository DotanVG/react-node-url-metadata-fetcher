import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';

const ModalDialog = ({
    open,
    onClose,
    label,
    closeLabel,
    triggerRef,
    children,
    panelClassName = '',
    testId,
}) => {
    const closeButtonRef = useRef(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) return undefined;

        const previousOverflow = document.body.style.overflow;
        const triggerElement = triggerRef?.current;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onCloseRef.current();
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            triggerElement?.focus();
        };
    }, [open, triggerRef]);

    if (!open) return null;

    return createPortal(
        <div
            data-testid={testId}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-8"
        >
            <div
                className={`relative max-h-full max-w-full rounded-xl bg-white shadow-2xl dark:bg-slate-900 ${panelClassName}`}
            >
                <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={onClose}
                    aria-label={closeLabel}
                    className="absolute right-2 top-2 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/80 text-white shadow-lg transition hover:bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                    <FiX size={20} aria-hidden="true" />
                </button>
                {children}
            </div>
        </div>,
        document.body
    );
};

export default ModalDialog;
