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
