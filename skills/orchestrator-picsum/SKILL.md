---
name: orchestrator-picsum
description: Generate placeholder images using picsum.photos that match the design system color scheme. Use during build phase when sections need hero images, avatars, backgrounds, or any visual content.
---

# Orchestrator Picsum

Generates picsum.photos URLs for placeholder images that suit the design context.

## When to Use

During `craft-*` tasks when a section needs images (hero backgrounds, testimonial avatars, feature illustrations, product screenshots, team photos, etc).

## How It Works

Picsum provides real photography at any dimension. Use these URL patterns:

### Basic
```
https://picsum.photos/{width}/{height}
```

### Seeded (consistent across reloads)
```
https://picsum.photos/seed/{seed}/{width}/{height}
```

### Grayscale (matches minimal/monochrome designs)
```
https://picsum.photos/seed/{seed}/{width}/{height}?grayscale
```

### Blurred (for backgrounds behind text)
```
https://picsum.photos/seed/{seed}/{width}/{height}?blur=2
```

### Combined
```
https://picsum.photos/seed/{seed}/{width}/{height}?grayscale&blur=2
```

## Size Guide by Section Kind

| Section Kind | Dimensions | Notes |
|---|---|---|
| hero | 1920x1080 | Full-width background |
| hero (contained) | 800x600 | Side illustration |
| features | 400x300 | Feature card images |
| testimonials (avatar) | 80x80 | Round avatar |
| testimonials (photo) | 200x200 | Larger portrait |
| pricing | none | Usually no images |
| gallery | 600x400 | Grid items |
| team | 300x300 | Square headshots |
| blog/cards | 600x340 | 16:9 card thumbnails |
| logo/partners | 200x80 | Grayscale recommended |

## Seed Strategy

Use deterministic seeds based on section + index for consistency:

```
seed = {section-id}-{index}
```

Examples:
- `https://picsum.photos/seed/hero-1/1920/1080`
- `https://picsum.photos/seed/testimonials-1/80/80`
- `https://picsum.photos/seed/testimonials-2/80/80`
- `https://picsum.photos/seed/features-1/400/300`

## Design Scheme Matching

Read the design system to decide image treatment:

| Design Tone | Treatment |
|---|---|
| Minimal / monochrome | `?grayscale` |
| Dark theme | `?grayscale` or blurred backgrounds |
| Colorful / vibrant | No filter (full color) |
| Soft / muted | `?blur=1` for backgrounds |
| Professional / corporate | `?grayscale` for team, color for hero |

## Usage in Tailwind

```html
<!-- Hero background -->
<div class="bg-cover bg-center" style="background-image: url('https://picsum.photos/seed/hero-1/1920/1080?blur=2')">

<!-- Avatar -->
<img src="https://picsum.photos/seed/avatar-1/80/80" class="rounded-full" alt="User avatar" />

<!-- Feature card -->
<img src="https://picsum.photos/seed/feature-1/400/300" class="rounded-lg object-cover" alt="Feature illustration" />
```

## Important

- Always use `seed/` URLs for deterministic results
- Always include `alt` attributes for accessibility
- Match image dimensions to the layout (don't stretch)
- Use `object-cover` or `object-contain` in Tailwind for responsive fit
- For retina: double the dimensions in URL, constrain with CSS width/height
