# Phase 2 Frontend Design Decisions

## 1. Landing Page UI/UX Enhancements

Se ha mejorado la Landing Page para cumplir con el espíritu del "Swiss Focus" y a la vez hacerla menos aburrida mediante la adición de `framer-motion`:

- **Animaciones Minimalistas:** Se han implementado animaciones tipo *spring* suaves (stiffness: 100, damping: 15) en la entrada de los elementos. El hero section usa `staggerChildren` para revelar el contenido progresivamente sin abrumar.
- **Microinteracciones:** Los botones ahora tienen un sutil efecto de escala (`hover:-translate-y-0.5`) y el logo se escala ligeramente (`hover:scale-105`) al interactuar, proporcionando feedback visual manteniendo la limpieza.
- **Mejoras del Header:** El header ahora utiliza el `CaretLogo` en lugar de texto plano y se le ha añadido un efecto *glassmorphism* (`bg-surface/90` con `backdrop-blur-glass`) para que el scroll debajo se sienta más inmersivo.
- **Glassmorphism y Colores:** El fondo de la landing respeta el cambio de tema utilizando transiciones controladas por Tailwind (`transition-colors duration-medium ease-out-custom`).

## 2. Implementación de Identidad Visual (Logos/Favicon)

- Se ha creado el icono/favicon y el logo en formato SVG (`public/favicon.svg`, `public/logo.svg`) utilizando el símbolo `^` exclusivo de Caret con su color identitario `accent-caret` (`#FF4500`).
- Se ha actualizado el `index.html` para enlazar este nuevo favicon SVG (en lugar del default de Vite).
- El componente interno `<CaretLogo />` ya estaba preparado en `Logo.tsx` y se ha integrado completamente en la aplicación.

## 4. Evolución de la Identidad Visual y Colores

Se ha descartado la paleta inicial por ser demasiado "burda" y se ha implementado una nueva dirección visual:

- **Nueva Paleta Cromática:** Se han actualizado los tokens de color en `index.css` hacia tonos más vibrantes y modernos (Royal Blue, Vibrant Orange, Deep Violet). En modo oscuro, se han suavizado los contrastes para una estética más "tech-premium".
- **Animación de Seguimiento de Cursor:** Se ha implementado un sistema de seguimiento de cursor reactivo en la Landing Page. Un anillo minimalista sigue al puntero con físicas de muelle (`framer-motion` springs), y los gradientes de fondo ahora reaccionan dinámicamente a la posición del ratón, creando una sensación de profundidad y respuesta inmediata.
- **Eliminación de Referencias "Swiss Focus":** Se ha eliminado el término del contenido de la landing (reemplazado por "Precision Editor") para evitar que el diseño se sienta encasillado o pretencioso, manteniendo la filosofía de diseño pero con una voz más propia.
- **Textura y Profundidad:** Se ha incrementado la opacidad del ruido visual y se han ajustado los desenfoques de los elementos de fondo para que la interfaz se sienta más táctil y menos plana.

## 5. Ajuste de UX tras revisión visual

Tras pruebas visuales, se aplicaron correcciones para alinear la landing con `docs/guidance/FRONTEND.md` y mejorar legibilidad:

- **Eliminación del cursor follower circular:** Se retiró la burbuja/anillo que seguía el cursor por resultar intrusiva y generar artefactos visuales.
- **Nuevo seguimiento de cursor en background:** En su lugar, se implementó un glow radial sutil que sigue el ratón solo en desktop (`md:block`), manteniendo el enfoque minimalista.
- **Botón primario corregido:** Se simplificó el CTA principal para usar clases base del componente `Button` (variant `primary`) + microinteracción leve, asegurando contraste y visibilidad del texto.
- **Paleta semántica restaurada:** Se revirtió el hardcode de colores en `@theme` y se volvió a tokens semánticos basados en variables RGB (`--color-*-rgb`) para respetar light/dark mode y la guía de frontend.

## 6. Simplificación de paleta para mayor carácter

A raíz de una nueva revisión estética, la landing se ajustó para reforzar identidad con menos colores activos:

- **Reducción de protagonismo del morado (`accent-ai`):** Se eliminó del hero y del background principal para evitar una estética genérica "SaaS gradient".
- **Dirección cromática principal:** La UI pública de la landing ahora prioriza **azul (`accent-main`) + naranja (`accent-caret`) + neutros**, manteniendo el morado reservado para contextos estrictamente AI cuando aporte semántica real.
- **Hero más minimalista:** Se cambió el titular para que el acento cromático recaiga solo en la palabra clave “precision”, en lugar de colorear toda la línea.
- **Cards más sobrias:** Se redujo glassmorphism agresivo, sombras y radios excesivos para volver a una composición más limpia y alineada con el estilo minimal.

## 7. Motion polish con Framer Motion

Nueva iteración de animaciones para aumentar personalidad sin romper el minimalismo:

- **Parallax sutil del hero:** Se añadió `useScroll` + `useTransform` para desplazar/opacar ligeramente el bloque principal durante scroll.
- **Glow reactivo al cursor:** Se mantiene seguimiento del ratón únicamente en capas de fondo (sin cursor bubble superpuesto).
- **Accesibilidad motion-aware:** Se incorporó `useReducedMotion` para degradar animaciones continuas cuando el sistema lo solicita.
- **Microloop de acento:** La línea superior del hero ahora incluye un punto animado de baja intensidad como detalle de identidad.

## 9. Document Tabs (multi-document editing)

Implemented a persistent tab strip for opening multiple documents simultaneously:

- **`src/stores/tabs_store.ts`**: New Zustand store tracking `open_tabs: { id, title }[]`. Actions: `add_tab` (idempotent — silently ignores duplicates), `update_tab_title`, `close_tab`, `close_all_tabs`. Exported via `stores/index.ts`.
- **`src/features/editor/components/DocumentTabs.tsx`**: Horizontal tab strip rendered above the sub-header in `EditorPage`. Each tab shows a `FileText` icon, truncated title, and a hover-revealed close (×) button. Closing the active tab navigates to the nearest remaining tab or `/documents` if all are closed. A `+` button at the right navigates to `/documents`. Carries `ui-peripheral` class (fades with focus mode, z-30 chrome layer). WCAG: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-label` on every interactive element.
- **`EditorPage.tsx` integration**: Imports `DocumentTabs` and renders it at the top of the editor flex column. Calls `add_tab` and `update_tab_title` on document load and whenever the server-fetched title changes. Title save callbacks (`handle_title_change`, `handle_title_blur`) also call `update_tab_title` after a successful API write.

## 10. Selection Menu / Floating Formatting Toolbar

Added a compact BubbleMenu that appears over selected text:

- **`src/features/editor/components/SelectionMenu.tsx`**: Wraps Tiptap v3 `BubbleMenu` (imported from `@tiptap/react/menus` — v3 moved menus to a separate sub-path using Floating UI instead of Tippy). Displays Bold, Italic, Underline, Strikethrough, Highlight, Code, and Link buttons with `aria-pressed` state and accessible labels. A vertical divider separates inline-style buttons from code/link. Carries `ui-peripheral` class (z-40 floating UI layer).
- **`CaretEditor.tsx` integration**: `<SelectionMenu editor={editor} />` rendered between the toolbar and the scrollable editor area, guarded by `editable && editor`.


Se restructuró el hero en dos columnas (texto + mockup) y se creó el componente `AnimatedMockup`:

- **Hero dos columnas:** En desktop (`md+`), el hero pasa a `grid-cols-2` con texto a la izquierda y el mockup a la derecha. En mobile se apila verticalmente.
- **`AnimatedMockup` — `src/features/landing/components/AnimatedMockup.tsx`:** Nuevo componente decorativo que simula una sesión de edición real:
  - Chrome de navegador (semáforo macOS + barra URL con `^` brand icon).
  - Top bar de la app con logo, nombre del documento y avatares de colaboración.
  - Área de documento con palabras que se van escribiendo una a una y cursor naranja parpadeante.
  - Panel AI lateral con mensaje de usuario y respuesta IA que se va revelando carácter a carácter.
  - Bucle infinito basado en máquina de estados async (`live` guard para cleanup correcto).
- **3D tilt con mouse:** El componente `useCardTilt` aplica `rotateX`/`rotateY` con spring (stiffness 200, damping 28) según la posición del ratón relativa al centro de la tarjeta, dando sensación de profundidad 3D.
- **Tema siempre oscuro:** El mockup fuerza la clase `.dark` en su raíz para mostrar la versión dark de la app de forma consistente independientemente del tema del usuario.
- **`aria-hidden="true"`:** El mockup es puramente decorativo; no es interactivo ni accesible por lectores de pantalla.
- **`useReducedMotion` gate:** Todos los bucles de animación se omiten con `prefers-reduced-motion`, mostrando el estado final estático.
