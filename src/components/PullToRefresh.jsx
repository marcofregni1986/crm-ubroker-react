import React, { useState, useEffect, useRef } from 'react';
import { RefreshCcw } from 'lucide-react';

/**
 * PullToRefresh - Componente per ricaricare la pagina su mobile trascinando verso il basso.
 * Risolve i problemi di cache e sincronizzazione forzando un reload completo.
 */
export default function PullToRefresh({ children }) {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const containerRef = useRef(null);
    const startY = useRef(0);
    const isPulling = useRef(false);

    const THRESHOLD = 80; // Pixel necessari per attivare il refresh

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleTouchStart = (e) => {
            // Attiviamo solo se siamo in cima alla pagina
            if (window.scrollY === 0) {
                startY.current = e.touches[0].pageY;
                isPulling.current = true;
            } else {
                isPulling.current = false;
            }
        };

        const handleTouchMove = (e) => {
            if (!isPulling.current || isRefreshing) return;

            const currentY = e.touches[0].pageY;
            const diff = currentY - startY.current;

            if (diff > 0) {
                // Applichiamo una resistenza (easing) per un feeling più naturale
                const resistance = 0.4;
                const distance = Math.min(diff * resistance, THRESHOLD + 20);
                setPullDistance(distance);

                // Impediamo lo scroll nativo del browser mentre trasciniamo
                if (diff > 10 && e.cancelable) {
                    e.preventDefault();
                }
            }
        };

        const handleTouchEnd = () => {
            if (!isPulling.current) return;
            isPulling.current = false;

            if (pullDistance >= THRESHOLD) {
                triggerRefresh();
            } else {
                setPullDistance(0);
            }
        };

        el.addEventListener('touchstart', handleTouchStart, { passive: false });
        el.addEventListener('touchmove', handleTouchMove, { passive: false });
        el.addEventListener('touchend', handleTouchEnd);

        return () => {
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchmove', handleTouchMove);
            el.removeEventListener('touchend', handleTouchEnd);
        };
    }, [pullDistance, isRefreshing]);

    const triggerRefresh = () => {
        setIsRefreshing(true);
        setPullDistance(THRESHOLD);

        // Feedback aptico se supportato
        if (window.navigator.vibrate) {
            window.navigator.vibrate(50);
        }

        // Piccolo delay per mostrare l'animazione e poi reload
        setTimeout(() => {
            window.location.reload();
        }, 800);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', minHeight: '100vh', width: '100%' }}>
            {/* Indicatore visivo */}
            <div
                style={{
                    position: 'absolute',
                    top: pullDistance - 50,
                    left: '50%',
                    transform: `translateX(-50%) rotate(${pullDistance * 2}deg)`,
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'var(--accent-blue, #3b82f6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 9999,
                    opacity: Math.min(pullDistance / THRESHOLD, 1),
                    transition: isPulling.current ? 'none' : 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}
            >
                <RefreshCcw size={20} className={isRefreshing ? 'spin-icon' : ''} />
            </div>

            <div style={{
                transform: pullDistance > 0 ? `translateY(${pullDistance * 0.5}px)` : 'none',
                transition: isPulling.current ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}>
                {children}
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spin-icon {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    );
}
