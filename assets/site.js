(() => {
  const root = document.documentElement;
  let ticking = false;

  const updateViewportVars = () => {
    ticking = false;
    root.style.setProperty('--scroll-y', `${window.scrollY}px`);
  };

  const requestViewportUpdate = () => {
    if (ticking) {
      return;
    }
    ticking = true;
    window.requestAnimationFrame(updateViewportVars);
  };

  window.addEventListener('scroll', requestViewportUpdate, { passive: true });
  requestViewportUpdate();

  window.addEventListener('pointermove', (event) => {
    const x = Math.round((event.clientX / Math.max(window.innerWidth, 1)) * 100);
    const y = Math.round((event.clientY / Math.max(window.innerHeight, 1)) * 100);
    root.style.setProperty('--mouse-x', `${x}%`);
    root.style.setProperty('--mouse-y', `${y}%`);
  }, { passive: true });

  const revealTargets = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });

    revealTargets.forEach((element) => observer.observe(element));
  } else {
    revealTargets.forEach((element) => element.classList.add('is-visible'));
  }

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy') || '';
      const original = button.textContent;
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = 'Copied';
      } catch {
        button.textContent = value;
      }
      window.setTimeout(() => {
        button.textContent = original;
      }, 1400);
    });
  });

  const launcherLink = document.querySelector('[data-launcher-link]');
  if (launcherLink) {
    fetch(launcherLink.getAttribute('href'), { method: 'HEAD', cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Launcher missing');
        }
      })
      .catch(() => {
        launcherLink.setAttribute('aria-disabled', 'true');
        launcherLink.removeAttribute('download');
        launcherLink.textContent = 'Launcher Coming Soon';
      });
  }

  document.querySelectorAll('a[href^="/"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('//')) {
      return;
    }

    link.addEventListener('mouseenter', () => {
      const preload = document.createElement('link');
      preload.rel = 'prefetch';
      preload.href = href;
      document.head.appendChild(preload);
    }, { once: true });

    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) {
        return;
      }

      event.preventDefault();
      const navigate = () => {
        window.location.href = href;
      };

      if (document.startViewTransition) {
        document.body.classList.add('is-transitioning');
        document.startViewTransition(navigate);
      } else {
        document.body.animate([
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(8px)' }
        ], {
          duration: 170,
          easing: 'ease-out',
          fill: 'forwards'
        }).finished.then(navigate).catch(navigate);
      }
    });
  });
})();
