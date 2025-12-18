const presets = [
    {
        name: 'oil',
        before: 'img/oilbefore.jpeg',
        after: 'img/oilafter.jpeg'
    },
    {
        name: 'santa',
        before: 'img/santabefore.jpeg',
        after: 'img/santaafter.jpeg'
    },
    {
        name: '3d',
        before: 'img/3dbefore.jpg',
        after: 'img/3dafter.jpg'
    },
    {
        name: 'pixar',
        before: 'img/pixarbefore.jpg',
        after: 'img/pixarafter.jpg'
    },
    {
        name: 'studio',
        before: 'img/studiobefore.jpg',
        after: 'img/studioafter.jpeg'
    }
];

let currentIndex = 0;
const beforeImg = document.getElementById('img-before');
const afterImg = document.getElementById('img-after');
const showcaseContainer = document.querySelector('.polaroid-showcase');
const afterPolaroid = document.querySelector('.polaroid.after');

function rotateImages() {
    currentIndex = (currentIndex + 1) % presets.length;
    const nextPreset = presets[currentIndex];

    // Add fade-out effect
    beforeImg.style.opacity = '0';
    afterImg.style.opacity = '0';
    afterPolaroid.classList.remove('shimmer');
    
    // Add magic shake to container
    showcaseContainer.classList.add('magic-shake');

    setTimeout(() => {
        // Change sources
        beforeImg.src = nextPreset.before;
        afterImg.src = nextPreset.after;

        // Wait for image load
        beforeImg.onload = () => {
             beforeImg.style.opacity = '1';
        };

        const onAfterLoad = () => {
             afterImg.style.opacity = '1';
             // Trigger shimmer effect
             afterPolaroid.classList.remove('shimmer');
             void afterPolaroid.offsetWidth; // Force reflow
             afterPolaroid.classList.add('shimmer');
        };

        afterImg.onload = onAfterLoad;

        // Fallback if cached
        if (beforeImg.complete) beforeImg.style.opacity = '1';
        if (afterImg.complete) onAfterLoad();
        
        // Remove magic shake
        setTimeout(() => {
            showcaseContainer.classList.remove('magic-shake');
        }, 500);

    }, 500); // Wait 500ms for fade out
}

// Start rotation
setInterval(rotateImages, 4000); // 4 seconds total (3s view + 1s transition approx)

// Add CSS class for shake via JS just in case, or rely on CSS file.
// Let's inject the keyframe if not present, but better to put in CSS.
// I will assume style-v2.css needs this 'magic-shake' class.

