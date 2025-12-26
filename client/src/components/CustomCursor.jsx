import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring, AnimatePresence } from 'framer-motion';

const CustomCursor = () => {
    const [isHovering, setIsHovering] = useState(false);
    const cursorX = useMotionValue(-100);
    const cursorY = useMotionValue(-100);

    const [isVisible, setIsVisible] = useState(false);

    const springConfig = { damping: 300, stiffness: 5000 };
    const cursorXSpring = useSpring(cursorX, springConfig);
    const cursorYSpring = useSpring(cursorY, springConfig);

    const [isTouchDevice, setIsTouchDevice] = useState(false);

    useEffect(() => {
        // Check if device has a fine pointer (mouse)
        const checkPointer = () => {
            const isFine = window.matchMedia('(pointer: fine)').matches;
            setIsTouchDevice(!isFine);
            if (!isFine) setIsVisible(false);
        };

        checkPointer();
        window.addEventListener('resize', checkPointer);
        return () => window.removeEventListener('resize', checkPointer);
    }, []);

    useEffect(() => {
        if (isTouchDevice) return;

        const moveCursor = (e) => {
            cursorX.set(e.clientX);
            cursorY.set(e.clientY);
            setIsVisible(true);

            // Check if hovering over clickable elements
            const target = e.target;
            const isClickable = (
                target.tagName.toLowerCase() === 'button' ||
                target.tagName.toLowerCase() === 'a' ||
                target.closest('button') ||
                target.closest('a') ||
                target.classList.contains('cursor-pointer')
            );
            setIsHovering(isClickable);
        };
        // ... rest of handlers
        const handleMouseLeave = () => setIsVisible(false);
        const handleMouseEnter = () => setIsVisible(true);

        window.addEventListener('mousemove', moveCursor);
        document.addEventListener('mouseleave', handleMouseLeave);
        document.addEventListener('mouseenter', handleMouseEnter);

        return () => {
            window.removeEventListener('mousemove', moveCursor);
            document.removeEventListener('mouseleave', handleMouseLeave);
            document.removeEventListener('mouseenter', handleMouseEnter);
        };
    }, [cursorX, cursorY, isTouchDevice]);

    if (isTouchDevice) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <>
                    {/* Main Dot - Follows exactly */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed top-0 left-0 pointer-events-none z-[2147483647] mix-blend-difference"
                        style={{
                            x: cursorX,
                            y: cursorY,
                            translateX: "-50%",
                            translateY: "-50%",
                        }}
                    >
                        <div className="h-2 w-2 rounded-full bg-white transition-transform duration-200 scale-100" />
                    </motion.div>

                    {/* Trailing Ring - Smooth spring follow */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed top-0 left-0 pointer-events-none z-[2147483646] mix-blend-difference"
                        style={{
                            x: cursorXSpring,
                            y: cursorYSpring,
                            translateX: "-50%",
                            translateY: "-50%",
                        }}
                    >
                        <div
                            className={`rounded-full border border-white transition-all duration-300 ease-out 
                            ${isHovering ? 'h-12 w-12 bg-white/20 border-transparent backdrop-blur-sm' : 'h-8 w-8 bg-transparent'}`}
                        />
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default CustomCursor;
