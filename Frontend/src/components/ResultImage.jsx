import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiImage, FiMaximize2, FiX } from 'react-icons/fi';

const ResultImage = ({ image, alt, title, layout }) => {
    const [imageFailed, setImageFailed] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isPinned, setIsPinned] = useState(false);
    const triggerRef = useRef(null);
    const closeButtonRef = useRef(null);
    const suppressPassivePreviewRef = useRef(false);

    const showImage = image && !imageFailed;
    const showPreview = showImage && (isHovered || isFocused || isPinned);
    const previewName = title || 'this result';

    useEffect(() => {
        if (!isPinned) return undefined;

        const previousOverflow = document.body.style.overflow;
        const triggerElement = triggerRef.current;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                suppressPassivePreviewRef.current = true;
                setIsHovered(false);
                setIsFocused(false);
                setIsPinned(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            triggerElement?.focus();
        };
    }, [isPinned]);

    const containerClasses =
        layout === 'grid'
            ? 'aspect-[1.91/1]'
            : 'h-48 md:h-full md:min-h-[12rem]';

    if (!showImage) {
        return (
            <div
                className={`flex w-full items-center justify-center bg-slate-100 dark:bg-slate-800 ${containerClasses}`}
            >
                <FiImage
                    className="text-slate-400 dark:text-slate-600"
                    size={30}
                    aria-label="No preview image"
                />
            </div>
        );
    }

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onMouseEnter={() => {
                    suppressPassivePreviewRef.current = false;
                    setIsHovered(true);
                }}
                onMouseLeave={() => {
                    suppressPassivePreviewRef.current = false;
                    setIsHovered(false);
                }}
                onFocus={() => {
                    if (!suppressPassivePreviewRef.current) setIsFocused(true);
                }}
                onBlur={() => {
                    suppressPassivePreviewRef.current = false;
                    setIsFocused(false);
                }}
                onClick={() => {
                    suppressPassivePreviewRef.current = false;
                    setIsPinned(true);
                }}
                aria-label={`Open full image for ${previewName}`}
                aria-haspopup="dialog"
                aria-expanded={isPinned}
                className={`group relative block w-full cursor-zoom-in overflow-hidden bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:bg-slate-800 ${containerClasses}`}
            >
                <img
                    src={image}
                    alt={alt || title || 'Preview image'}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => {
                        setImageFailed(true);
                        setIsPinned(false);
                    }}
                    className={`h-full w-full transition duration-300 group-hover:scale-[1.02] ${
                        layout === 'grid' ? 'object-cover' : 'object-contain p-2 md:p-3'
                    }`}
                />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-slate-950/80 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <FiMaximize2 size={13} aria-hidden="true" />
                    Full image
                </span>
            </button>

            {showPreview &&
                createPortal(
                    <div
                        data-testid="full-image-preview"
                        role={isPinned ? 'dialog' : undefined}
                        aria-modal={isPinned ? 'true' : undefined}
                        aria-label={isPinned ? `Full image for ${previewName}` : undefined}
                        aria-hidden={isPinned ? undefined : 'true'}
                        className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-8 ${
                            isPinned ? 'pointer-events-auto' : 'pointer-events-none'
                        }`}
                    >
                        <div className="relative flex max-h-full max-w-full items-center justify-center">
                            <img
                                src={image}
                                alt={isPinned ? `${alt || title || 'Preview image'} full preview` : ''}
                                referrerPolicy="no-referrer"
                                className="max-h-[88vh] max-w-[94vw] rounded-lg bg-white object-contain shadow-2xl sm:max-h-[84vh] sm:max-w-[88vw] dark:bg-slate-900"
                            />
                            {isPinned && (
                                <button
                                    ref={closeButtonRef}
                                    type="button"
                                    onClick={() => {
                                        suppressPassivePreviewRef.current = true;
                                        setIsHovered(false);
                                        setIsFocused(false);
                                        setIsPinned(false);
                                    }}
                                    aria-label="Close full image"
                                    className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/80 text-white shadow-lg transition hover:bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    <FiX size={20} aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
};

export default ResultImage;
