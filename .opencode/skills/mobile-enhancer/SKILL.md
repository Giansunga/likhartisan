---
name: mobile-enhancer
description: Mobile view optimization and responsive design for LikhArtisan
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: responsive-design
---

## What I do
- Optimize layouts for mobile devices (320px-768px)
- Implement responsive breakpoints and fluid typography
- Handle touch interactions and gestures
- Optimize performance for mobile networks
- Implement mobile-specific UI patterns

## When to use me
Use this when modifying or creating mobile-responsive components.

## Breakpoints
```css
/* Mobile first approach */
--breakpoint-sm: 640px;   /* Large phones */
--breakpoint-md: 768px;   /* Tablets */
--breakpoint-lg: 1024px;  /* Small laptops */
--breakpoint-xl: 1280px;  /* Desktops */
```

## Responsive patterns
```tsx
// Container with responsive padding
<div style={{
  padding: 'clamp(16px, 4vw, 32px)',
  maxWidth: '1200px',
  margin: '0 auto'
}}>

// Responsive grid
<div style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 'clamp(12px, 2vw, 24px)'
}}>

// Hide on mobile
<div className="hidden-mobile" style={{
  '@media (max-width: 768px)': { display: 'none' }
}}>
```

## Mobile navigation patterns
- Hamburger menu for < 768px
- Bottom tab bar for key actions
- Swipe gestures for carousels
- Pull-to-refresh for lists

## Touch optimization
- Minimum tap target: 44px x 44px
- Add `touch-action: manipulation` to reduce delay
- Use `-webkit-tap-highlight-color: transparent`
- Implement `overscroll-behavior: contain` for modals

## Performance checklist
- [ ] Lazy load images below fold
- [ ] Use `loading="lazy"` for images
- [ ] Minimize layout shifts (CLS)
- [ ] Use `font-display: swap` for fonts
- [ ] Compress images to WebP/AVIF
- [ ] Implement virtual scrolling for long lists

## Mobile-specific CSS
```css
/* Prevent zoom on input focus */
input, select, textarea {
  font-size: 16px !important;
}

/* Smooth scroll */
html {
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

/* Prevent overscroll bounce */
body {
  overscroll-behavior-y: contain;
}

/* Mobile safe area */
.container {
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

## Common mobile issues to fix
1. **Horizontal overflow** - Check `overflow-x: hidden` on body
2. **Tiny text** - Use `clamp(14px, 2.5vw, 16px)` for body
3. **Touch targets too small** - Min 44px height on buttons
4. **Fixed headers blocking content** - Add `scroll-padding-top`
5. **Images breaking layout** - Use `max-width: 100%` and `height: auto`
