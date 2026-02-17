/**
 * NUOVO STEP ONE 2024 - High Fidelity Presentation Logic
 */

class Presentation {
    constructor() {
        this.currentSlideIndex = 0;
        this.slidesData = typeof SLIDES_DATA !== 'undefined' ? SLIDES_DATA : [];
        this.slider = document.getElementById('slider');
        this.progressBar = document.getElementById('progressBar');
        this.currentCounter = document.getElementById('currentSlide');
        this.totalCounter = document.getElementById('totalSlides');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');

        this.init();
    }

    init() {
        if (this.slidesData.length === 0) {
            console.error('No slide data found.');
            if (this.slider) this.slider.innerHTML = '<div class="error">Errore: Dati delle slide non trovati.</div>';
            return;
        }

        this.renderSlides();
        this.updateUI();
        this.setupEventListeners();

        const loader = document.querySelector('.loader');
        if (loader) loader.remove();
    }

    renderSlides() {
        this.slider.innerHTML = '';
        this.totalCounter.textContent = this.slidesData.length;

        this.slidesData.forEach((data, index) => {
            const slide = document.createElement('div');
            const partClass = index < 51 ? 'part-1' : 'part-2';

            // Determine template
            let isHero = data.type === 'title' || (index === 0);
            slide.className = `slide ${partClass} ${isHero ? 'slide-hero' : ''} ${index === 0 ? 'active' : ''}`;

            let content = '';
            if (isHero) {
                const title = data.title || (data.text_blocks.join(' ') || `Slide ${index + 1}`);
                const subtitle = data.subtitle || "";
                content = `
                    <div class="hero-group">
                        <h1 style="animation-delay: 0.1s;">${title}</h1>
                        ${subtitle ? `<p style="animation-delay: 0.3s;">${subtitle}</p>` : ''}
                        ${data.images && data.images.length > 0 ? `
                            <div class="slide-visual">
                                ${data.images.map(img => `<img src="${img}" alt="Slide Visual">`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            } else {
                content = `
                    <div class="slide-content-card">
                        ${data.title ? `<h2 style="animation-delay: 0.1s;">${data.title}</h2>` : ''}
                        <div class="content-blocks">
                            ${data.text_blocks.map((txt, i) => {
                    const delay = 0.2 + (i * 0.05);
                    if (txt.length < 50 && txt === txt.toUpperCase()) {
                        return `<h3 style="color: var(--accent-color); margin: 1.5rem 0 0.5rem 0; font-size: 1.4rem; animation: slideUpFade 0.6s ease ${delay}s forwards; opacity:0;">${txt}</h3>`;
                    }
                    return `<p style="margin-bottom: 0.6rem; animation: slideUpFade 0.6s ease ${delay}s forwards; opacity:0;">${txt}</p>`;
                }).join('')}
                        </div>
                        ${data.images && data.images.length > 0 ? `
                            <div class="slide-visual">
                                ${data.images.map(img => `<img src="${img}" alt="Slide Visual">`).join('')}
                            </div>
                        ` : ''}
                        ${data.tables && data.tables.length > 0 ? `
                            <div class="slide-table" style="margin-top: 1.5rem; background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 12px; animation: slideUpFade 1s ease 0.4s forwards; opacity:0;">
                                ${data.tables.flat().map(row => `<div class="table-row" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding: 0.4rem 0; font-size: 0.85rem;">${row}</div>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }

            slide.innerHTML = content;
            this.slider.appendChild(slide);
        });
    }

    setupEventListeners() {
        this.prevBtn.addEventListener('click', () => this.goToSlide(this.currentSlideIndex - 1));
        this.nextBtn.addEventListener('click', () => this.goToSlide(this.currentSlideIndex + 1));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === ' ') this.goToSlide(this.currentSlideIndex + 1);
            if (e.key === 'ArrowLeft') this.goToSlide(this.currentSlideIndex - 1);
        });

        let touchStartX = 0;
        document.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX);
        document.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            if (touchStartX - touchEndX > 50) this.goToSlide(this.currentSlideIndex + 1);
            if (touchEndX - touchStartX > 50) this.goToSlide(this.currentSlideIndex - 1);
        });
    }

    goToSlide(index) {
        if (index < 0 || index >= this.slidesData.length) return;

        // Reset animations on the slide being entered
        const nextSlide = this.slider.children[index];
        const elementsToAnimate = nextSlide.querySelectorAll('[style*="animation"]');
        elementsToAnimate.forEach(el => {
            const currentAnim = el.style.animation;
            el.style.animation = 'none';
            void el.offsetWidth;
            el.style.animation = currentAnim;
        });

        this.currentSlideIndex = index;
        this.updateUI();
    }

    updateUI() {
        this.slider.style.transform = `translateX(-${this.currentSlideIndex * 100}%)`;

        const allSlides = document.querySelectorAll('.slide');
        allSlides.forEach((s, i) => {
            if (i === this.currentSlideIndex) s.classList.add('active');
            else s.classList.remove('active');
        });

        this.currentCounter.textContent = this.currentSlideIndex + 1;
        const progress = ((this.currentSlideIndex + 1) / this.slidesData.length) * 100;
        this.progressBar.style.width = `${progress}%`;

        this.prevBtn.style.opacity = this.currentSlideIndex === 0 ? '0.3' : '1';
        this.nextBtn.style.opacity = this.currentSlideIndex === this.slidesData.length - 1 ? '0.3' : '1';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Presentation();
});
