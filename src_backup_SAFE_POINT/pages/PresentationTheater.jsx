import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2, LayoutGrid } from 'lucide-react';

const TOTAL_SLIDES = 96;
const SLIDE_PREFIX = 'Diapositiva';
const SLIDE_EXT = 'PNG';

export default function PresentationTheater() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const hideControlsTimeout = useRef(null);
    const navigate = useNavigate();

    // Reset controls timer
    const resetControlsTimer = useCallback(() => {
        setShowControls(true);
        if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
        hideControlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
    }, []);

    const goToSlide = useCallback((index) => {
        if (index >= 0 && index < TOTAL_SLIDES) {
            setCurrentIndex(index);
            resetControlsTimer();
        }
    }, [resetControlsTimer]);

    const handleNext = useCallback(() => goToSlide(currentIndex + 1), [currentIndex, goToSlide]);
    const handlePrev = useCallback(() => goToSlide(currentIndex - 1), [currentIndex, goToSlide]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight' || e.key === ' ') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'Escape') {
                if (isFullscreen) {
                    document.exitFullscreen().catch(() => { });
                    setIsFullscreen(false);
                } else {
                    navigate(-1);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleNext, handlePrev, isFullscreen, navigate]);

    // Mouse move resets controls
    useEffect(() => {
        window.addEventListener('mousemove', resetControlsTimer);
        return () => window.removeEventListener('mousemove', resetControlsTimer);
    }, [resetControlsTimer]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const currentSlideUrl = `/slides/${SLIDE_PREFIX}${currentIndex + 1}.${SLIDE_EXT}`;

    return (
        <div className="presentation-theater" style={styles.container}>
            {/* BACKGROUND BLUR (Visual Depth) */}
            <div style={{
                ...styles.backdrop,
                backgroundImage: `url(${currentSlideUrl})`
            }} />

            {/* HEADER / TOPBAR */}
            <div style={{
                ...styles.header,
                opacity: showControls ? 1 : 0,
                transform: showControls ? 'translateY(0)' : 'translateY(-20px)'
            }}>
                <button onClick={() => navigate(-1)} style={styles.iconBtn}>
                    <X size={24} />
                </button>
                <div style={styles.title}>NUOVO STEP ONE 2024</div>
                <button onClick={toggleFullscreen} style={styles.iconBtn}>
                    {isFullscreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
                </button>
            </div>

            {/* MAIN SLIDE AREA */}
            <div
                style={styles.slideStage}
                onClick={resetControlsTimer}
            >
                <div style={styles.slideWrapper}>
                    <img
                        src={currentSlideUrl}
                        alt={`Slide ${currentIndex + 1}`}
                        style={styles.slideImage}
                        onLoad={(e) => e.target.style.opacity = 1}
                    />
                </div>

                {/* NAVIGATION OVERLAYS */}
                <div
                    style={{ ...styles.navOverlay, left: 0 }}
                    onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                    className="hover-fade"
                >
                    <ChevronLeft size={64} style={styles.navIcon} />
                </div>
                <div
                    style={{ ...styles.navOverlay, right: 0 }}
                    onClick={(e) => { e.stopPropagation(); handleNext(); }}
                    className="hover-fade"
                >
                    <ChevronRight size={64} style={styles.navIcon} />
                </div>
            </div>

            {/* FOOTER / PROGRESS */}
            <div style={{
                ...styles.footer,
                opacity: showControls ? 1 : 0,
                transform: showControls ? 'translateY(0)' : 'translateY(20px)'
            }}>
                <div style={styles.progressContainer}>
                    <div style={styles.progressLabel}>
                        Slide {currentIndex + 1} di {TOTAL_SLIDES}
                    </div>
                    <div style={styles.track}>
                        <div style={{
                            ...styles.progressFill,
                            width: `${((currentIndex + 1) / TOTAL_SLIDES) * 100}%`
                        }} />
                    </div>
                </div>

                <div style={styles.thumbnails}>
                    {/* Simple thumbnail-like quick nav can be added here if needed */}
                </div>
            </div>

            {/* STYLES & ANIMATIONS */}
            <style>{`
        .hover-fade {
            opacity: 0;
            transition: opacity 0.3s ease;
            cursor: pointer;
        }
        .hover-fade:hover {
            opacity: 1;
            background: linear-gradient(to right, rgba(0,0,0,0.2), transparent) if left;
        }
        .presentation-theater {
            user-select: none;
        }
      `}</style>
        </div>
    );
}

const styles = {
    container: {
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000',
        zIndex: 10000,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        fontFamily: "'Inter', sans-serif"
    },
    backdrop: {
        position: 'absolute',
        inset: '-20px',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(30px) brightness(0.3)',
        zIndex: 0,
        transition: 'background-image 0.5s ease'
    },
    header: {
        position: 'relative',
        height: '70px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 10,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
    },
    title: {
        fontSize: '18px',
        fontWeight: 700,
        letterSpacing: '1px',
        color: '#e2e8f0'
    },
    iconBtn: {
        background: 'none',
        border: 'none',
        color: '#fff',
        cursor: 'pointer',
        padding: '8px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.3s ease'
    },
    slideStage: {
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
        cursor: 'default'
    },
    slideWrapper: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
    },
    slideImage: {
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        boxShadow: '0 30px 60px rgba(0,0,0,0.8)',
        borderRadius: '8px',
        transition: 'opacity 0.5s ease',
        opacity: 0
    },
    navOverlay: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: '15%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 15
    },
    navIcon: {
        color: 'rgba(255,255,255,0.6)',
        filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.5))'
    },
    footer: {
        position: 'relative',
        height: '100px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 40px',
        zIndex: 10,
        background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
    },
    progressContainer: {
        width: '100%',
        maxWidth: '800px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
    },
    progressLabel: {
        fontSize: '14px',
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        fontWeight: 500
    },
    track: {
        width: '100%',
        height: '4px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '2px',
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
        transition: 'width 0.3s ease',
        boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)'
    }
};
