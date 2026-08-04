---
name: Kinetic Learning
colors:
  surface: '#fcf8fb'
  surface-dim: '#dcd9dc'
  surface-bright: '#fcf8fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7ea'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#464555'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4c42e9'
  primary: '#493ee5'
  on-primary: '#ffffff'
  primary-container: '#635bff'
  on-primary-container: '#fefaff'
  inverse-primary: '#c3c0ff'
  secondary: '#9f420a'
  on-secondary: '#ffffff'
  secondary-container: '#fd894f'
  on-secondary-container: '#6c2800'
  tertiary: '#8a2ab9'
  on-tertiary: '#ffffff'
  tertiary-container: '#a548d4'
  on-tertiary-container: '#fffafa'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#321ed2'
  secondary-fixed: '#ffdbcc'
  secondary-fixed-dim: '#ffb694'
  on-secondary-fixed: '#351000'
  on-secondary-fixed-variant: '#7b2f00'
  tertiary-fixed: '#f6d9ff'
  tertiary-fixed-dim: '#e8b3ff'
  on-tertiary-fixed: '#310048'
  on-tertiary-fixed-variant: '#7201a2'
  background: '#fcf8fb'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  headline-xl:
    fontFamily: Be Vietnam Pro
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 120px
---

## Brand & Style

The design system is centered on a "Supportive Academic Matchmaker" persona. The brand personality is optimistic, youthful, and highly accessible, aimed at reducing the social anxiety associated with finding study partners. 

The visual style blends **Corporate Modern** structure with **Soft-Tactile** elements. It utilizes a "Claymorphic" approach for 3D illustrations and key interactive components to create a sense of depth that feels friendly rather than industrial. The interface prioritizes generous whitespace, ultra-rounded corners, and a pastel-infused palette to foster an encouraging environment for students.

## Colors

The color palette is built on a high-energy contrast between "Deep Electric Purple" (Primary) and "Vibrant Sunset Orange" (Secondary). 

- **Primary:** Used for main actions, active states, and brand-defining containers.
- **Secondary:** Reserved for high-conversion buttons (e.g., "Get Started") and emphasizing growth-oriented keywords.
- **Surface Colors:** Instead of pure grays, the design system uses soft tinted pastels (Purple and Orange washes) to differentiate sections while maintaining a warm, non-clinical feel. 
- **Neutral:** A deep charcoal is used for text to ensure high readability against pastel backgrounds without the harshness of pure black.

## Typography

The typography system uses **Be Vietnam Pro** for headlines to provide a contemporary, slightly geometric character that feels professional yet energetic. **Plus Jakarta Sans** is used for all body and UI labels due to its soft terminals and exceptional legibility, which reinforces the approachable nature of the brand.

Headlines should use tight letter-spacing and heavy weights to create a strong visual anchor. Body text maintains a generous line height to ensure students can scan profiles and descriptions quickly without cognitive fatigue.

## Layout & Spacing

The layout utilizes a **fluid grid** model with significant breathing room to prevent the "cluttered" feeling common in social apps.

- **Desktop:** 12-column grid with 120px margins. Content is often centered in max-width containers (1200px) to maintain focus.
- **Mobile:** 4-column grid with 20px margins. 
- **Rhythm:** An 8px linear scale governs all padding and margins. Vertical rhythm is expansive (using `lg` and `xl` spacing) between major sections to allow the 3D illustrations to "float" comfortably without crowding the text.

## Elevation & Depth

Visual hierarchy is achieved through a combination of **Tonal Layering** and **Soft Ambient Shadows**.

1.  **Low Elevation:** White cards on pastel backgrounds use a very soft, high-spread shadow (15% opacity of the primary color) to appear "lifted."
2.  **Interactive Depth:** Primary buttons use a subtle gradient and a secondary "drop" shadow to mimic a physical button that can be pressed.
3.  **Illustrative Depth:** 3D assets should cast soft, blurred "puddle" shadows on the surface below them, rather than appearing flat against the background.
4.  **Glassmorphism:** Navigation bars and sticky headers should use a 20px backdrop blur with a 70% white tint to maintain context of the content beneath.

## Shapes

The shape language is defined by **Ultra-Roundedness**. There are no sharp corners in the design system.

- **Containers & Large Cards:** Use a 24px (2xl) radius to create a friendly, "bubbled" appearance.
- **Buttons:** Use a 12px radius, providing enough structure to be recognizable while remaining soft.
- **Chips & Badges:** Use a full pill shape (100px) to distinguish them from interactive buttons or cards.
- **Inputs:** Follow the button radius for consistency in the form-filling experience.

## Components

### Buttons
- **Primary:** High-saturation Orange or Purple with white text. Includes a subtle 2px inner-glow on the top edge to enhance the 3D effect.
- **Secondary:** Ghost style with a 1.5px border in the primary color and a soft pastel hover state.

### Cards (Matchmaking Profiles)
- Profiles are housed in white cards with `card_radius`. 
- Avatars are always circular with a 3px white border.
- Integrated "Availability" chips use high-contrast pastel backgrounds (e.g., soft green for "Available Now").

### Form Fields
- Inputs feature a soft gray-purple background (#F8F7FF) rather than a white background, making the active "white" focus state feel more prominent.
- Labels are consistently placed above the field in `label-md`.

### Chips
- Used for learning styles (e.g., "Visual Learner," "Night Owl"). 
- These should include a small emoji or icon prefix to add personality and speed up recognition.

### Navigation
- Mobile-first bottom navigation tabs with large, friendly icons and a clear active-state indicator (a small purple dot beneath the icon).