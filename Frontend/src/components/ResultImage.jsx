import { useRef, useState } from 'react';
import { FiImage, FiMaximize2 } from 'react-icons/fi';

import ModalDialog from './ModalDialog.jsx';

const ResultImage = ({ image, alt, title, layout, interactive = true }) => {
    const [imageFailed, setImageFailed] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef(null);

    const showImage = image && !imageFailed;
    const previewName = title || 'this result';

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

    const imageElement = (
        <img
            src={image}
            alt={alt || title || 'Preview image'}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => {
                setImageFailed(true);
                setIsOpen(false);
            }}
            className={`h-full w-full transition duration-300 group-hover:scale-[1.02] ${
                layout === 'grid' ? 'object-cover' : 'object-contain p-2 md:p-3'
            }`}
        />
    );

    if (!interactive) {
        return (
            <div
                className={`w-full overflow-hidden bg-slate-100 dark:bg-slate-800 ${containerClasses}`}
            >
                {imageElement}
            </div>
        );
    }

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen(true)}
                aria-label={`Open full image for ${previewName}`}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                className={`group relative block w-full cursor-zoom-in overflow-hidden bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:bg-slate-800 ${containerClasses}`}
            >
                {imageElement}
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-slate-950/80 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <FiMaximize2 size={13} aria-hidden="true" />
                    Full image
                </span>
            </button>

            <ModalDialog
                open={isOpen}
                onClose={() => setIsOpen(false)}
                label={`Full image for ${previewName}`}
                closeLabel="Close full image"
                triggerRef={triggerRef}
                testId="full-image-preview"
                panelClassName="flex items-center justify-center bg-transparent shadow-none dark:bg-transparent"
            >
                <img
                    src={image}
                    alt={`${alt || title || 'Preview image'} full preview`}
                    referrerPolicy="no-referrer"
                    className="max-h-[88vh] max-w-[94vw] rounded-lg bg-white object-contain shadow-2xl sm:max-h-[84vh] sm:max-w-[88vw] dark:bg-slate-900"
                />
            </ModalDialog>
        </>
    );
};

export default ResultImage;
